'use server';

import { hash } from 'bcryptjs';
import { z } from 'zod';

import { requireRateLimit } from '@/lib/action-helpers';
import { SECURITY } from '@/lib/constants';
import { firstZodIssueMessage } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { passwordsMatch, registerFieldsSchema } from '@/lib/schemas';
import { enqueueEmailVerificationEmail } from '@/services/email-verification.service';
import { UserService } from '@/services/user.service';

/**
 * 가입 폼 스키마 — **정본(`@/lib/schemas`)을 확장**한다.
 *
 * 예전에는 이 파일이 자체 사본을 들고 있었고 거기에는 `.max()` 가 하나도 없었다.
 * `users.name` 은 varchar(50), `users.email` 은 varchar(255) 이므로 그 길이를 넘긴 입력은
 * 검증을 통과한 뒤 DB 가 거부해 **원인 불명의 500** 이 됐다.
 *
 * 더 나쁜 것은 회귀 테스트(`schemas.limits.test.ts:65`)가 "DB 컬럼 폭을 넘는 이름은
 * 거부한다" 를 **쓰이지 않는 정본 쪽에만** 걸어 두고 계속 초록이었다는 점이다 —
 * 감사가 닫혔다고 기록됐지만 실제 가입 경로는 한 번도 지나가지 않았다.
 *
 * **비밀번호 규칙도 정본(`passwordSchema`)으로 통일된다.** 사본의 정규식은
 * `/^(?=...)[A-Za-z\d@$!%*?&#]/` 로 끝 앵커가 없어 사실상 첫 글자만 검사했고,
 * 특수문자 집합도 좁았다. 정본은 대/소/숫자/특수를 각각 독립 검사하며 집합이 넓다 —
 * **허용 범위가 넓어지는 방향**이고, 비밀번호 변경 경로(`changePasswordSchema`)가
 * 이미 쓰던 규칙과 같아져 두 경로의 불일치가 사라진다.
 */
const registerSchema = registerFieldsSchema
  .extend({
    accountType: z.enum(['ENGINEER', 'CLIENT']),
    // 공개 목록은 내부 id 를 주지 않는다 — 고객사 코드로 받아 서버가 찾는다(D14 A+).
    // clients.code 는 varchar(50) 이다.
    clientCode: z.string().trim().max(50).optional(),
  })
  .refine(passwordsMatch.check, passwordsMatch.options);

export async function registerUser(formData: FormData) {
  try {
    // 미인증 액션이라 IP 로 키잉된다. 전용 네임스페이스를 둬서 가입 시도 폭주가
    // 같은 IP 의 정상 SR 작업을 잠그지 않게 한다.
    await requireRateLimit('strict', 'register');
    const clientCodeValue = formData.get('clientCode');
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      confirmPassword: formData.get('confirmPassword') as string,
      accountType: formData.get('accountType') as 'ENGINEER' | 'CLIENT',
      // null을 undefined로 변환 (Zod optional은 undefined만 허용)
      clientCode: clientCodeValue ? (clientCodeValue as string) : undefined,
    };

    const validated = registerSchema.parse(data);

    // 고객사 담당자인데 고객사 미선택 시 에러
    if (validated.accountType === 'CLIENT' && !validated.clientCode) {
      return {
        success: false,
        error: '고객사 담당자는 소속 고객사를 선택해야 합니다.',
      };
    }

    // 코드를 **활성** 고객사로 해석한다. 예전에는 받은 clientId 를 조회 없이 소속으로 만들어,
    // 목록에 없는 비활성 고객사 id 를 직접 보내면 그 고객사의 가입 신청이 생겼다.
    let clientId: string | null = null;
    if (validated.accountType === 'CLIENT') {
      const client = await prisma.client.findFirst({
        where: { code: validated.clientCode, isActive: true },
        select: { id: true },
      });
      if (!client) {
        return {
          success: false,
          error: '선택한 고객사를 찾을 수 없습니다. 목록에서 다시 선택하세요.',
        };
      }
      clientId = client.id;
    }

    const userService = new UserService();

    // 이메일 중복 확인
    const existingUser = await userService.getUserByEmail(validated.email);
    if (existingUser) {
      return {
        success: false,
        error: '이미 등록된 이메일 주소입니다.',
      };
    }

    // 비밀번호 해싱
    const hashedPassword = await hash(validated.password, SECURITY.BCRYPT_WORK_FACTOR);

    // 역할 자동 결정
    const defaultRole = await prisma.role.findFirst({
      where: {
        name: validated.accountType === 'CLIENT' ? 'CLIENT_USER' : 'ENGINEER',
      },
    });

    if (!defaultRole) {
      return {
        success: false,
        error: '시스템 설정 오류: 기본 역할을 찾을 수 없습니다. 관리자에게 문의하세요.',
      };
    }

    // 트랜잭션으로 원자적 처리
    await prisma.$transaction(async (tx) => {
      // 1. 사용자 생성
      const user = await tx.user.create({
        data: {
          name: validated.name,
          email: validated.email,
          password: hashedPassword,
          // CLIENT는 즉시 활성화, ENGINEER는 승인 대기
          isActive: validated.accountType === 'CLIENT',
        },
      });

      // 2. 역할 할당
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: defaultRole.id,
        },
      });

      // 3. 고객사 할당 (CLIENT인 경우)
      // 셀프 가입으로 생성되는 소속은 PENDING 으로 두어, 고객사 관리자/운영자 승인 전까지
      // 세션 clientIds 에 포함되지 않도록 한다. (승인 전 크로스테넌트 데이터 접근 차단)
      if (clientId) {
        await tx.userClient.create({
          data: {
            userId: user.id,
            clientId,
            status: 'PENDING',
          },
        });
      }

      // 4. 이메일 인증 링크(결정 D13 B+) — 같은 트랜잭션의 아웃박스에 적재한다. 승인 화면이 인증 여부를 보인다.
      await enqueueEmailVerificationEmail(tx, {
        id: user.id,
        email: user.email,
        name: user.name,
      });
    });

    // 계정 유형별 안내 메시지
    // CLIENT 계정도 소속 승인 전까지는 데이터에 접근할 수 없으므로 승인 안내를 노출한다.
    const verifyNotice = ' 입력한 이메일로 보낸 확인 링크를 열어 주세요(승인 판단에 쓰입니다).';
    const message =
      validated.accountType === 'CLIENT'
        ? `회원가입이 완료되었습니다. 고객사 관리자 승인 후 이용할 수 있습니다.${verifyNotice}`
        : `회원가입이 완료되었습니다. 관리자 승인 후 사용 가능합니다.${verifyNotice}`;

    return {
      success: true,
      message,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: firstZodIssueMessage(error),
      };
    }

    // 에러 로그는 서버 측에서만 기록 (프로덕션에서는 로그 수집 시스템 사용)
    return {
      success: false,
      error: '회원가입 중 오류가 발생했습니다.',
    };
  }
}
