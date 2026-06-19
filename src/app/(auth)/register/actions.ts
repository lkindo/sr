'use server';

import { hash } from 'bcryptjs';
import { z } from 'zod';

import { requireRateLimit } from '@/lib/action-helpers';
import { SECURITY } from '@/lib/constants';
import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

const registerSchema = z
  .object({
    name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
    email: z.string().email('유효한 이메일 주소를 입력하세요.'),
    password: z
      .string()
      .min(8, '비밀번호는 최소 8자 이상이어야 합니다.')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/,
        '대소문자, 숫자, 특수문자를 포함해야 합니다.'
      ),
    confirmPassword: z.string(),
    accountType: z.enum(['ENGINEER', 'CLIENT']),
    clientId: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  });

export async function registerUser(formData: FormData) {
  try {
    await requireRateLimit('strict');
    const clientIdValue = formData.get('clientId');
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
      confirmPassword: formData.get('confirmPassword') as string,
      accountType: formData.get('accountType') as 'ENGINEER' | 'CLIENT',
      // null을 undefined로 변환 (Zod optional은 undefined만 허용)
      clientId: clientIdValue ? (clientIdValue as string) : undefined,
    };

    const validated = registerSchema.parse(data);

    // 고객사 담당자인데 고객사 미선택 시 에러
    if (validated.accountType === 'CLIENT' && !validated.clientId) {
      return {
        success: false,
        error: '고객사 담당자는 소속 고객사를 선택해야 합니다.',
      };
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
      if (validated.accountType === 'CLIENT' && validated.clientId) {
        await tx.userClient.create({
          data: {
            userId: user.id,
            clientId: validated.clientId,
          },
        });
      }
    });

    // 계정 유형별 안내 메시지
    const message =
      validated.accountType === 'CLIENT'
        ? '회원가입이 완료되었습니다. 로그인해주세요.'
        : '회원가입이 완료되었습니다. 관리자 승인 후 사용 가능합니다.';

    return {
      success: true,
      message,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0].message,
      };
    }

    // 에러 로그는 서버 측에서만 기록 (프로덕션에서는 로그 수집 시스템 사용)
    return {
      success: false,
      error: '회원가입 중 오류가 발생했습니다.',
    };
  }
}
