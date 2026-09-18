import { NextRequest, NextResponse } from 'next/server';

import { rateLimit } from '@/lib/api-rate-limit';
import { withErrorHandler } from '@/lib/auth-wrapper';
import prisma from '@/lib/prisma';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

/**
 * 공개 API: 활성 고객사 목록 조회 (회원가입용)
 * 인증 불필요 - 회원가입 시 고객사 선택을 위한 공개 API
 *
 * 고객사 이름·코드는 공개해도 되는 기준 정보로 보고 목록을 유지한다(2026-09-18 소유자 결정 D14 A+,
 * 헌법 §1.2). 다만 다음 두 가지는 지킨다.
 *  - **내부 id 를 주지 않는다.** 익명에게 준 id 는 교차 테넌트 IDOR 의 입력으로 실제로 쓰였다
 *    (감사 2026-07-29). 가입은 코드를 받아 서버가 고객사를 찾는다(`register/actions.ts`).
 *  - **IP 당 strict(1분 5회)로 제한한다.** 한 번 호출로 전체가 나오므로 수집을 막지는 못하지만,
 *    익명 호출마다 DB 조회가 도는 것은 막는다. 가입 화면은 마운트 때 한 번만 부른다.
 *
 * 인증은 없지만 래퍼는 경유한다 — be-rules §1 은 성능 계측에 예외를 두지 않으며,
 * 오류를 500 으로 뭉개지 않고 `handleApiError` 가 매핑하게 한다(감사 D-11).
 */
export const GET = rateLimit(
  withErrorHandler(async (_request: NextRequest) => {
    const clients = await prisma.client.findMany({
      where: {
        isActive: true, // 활성 고객사만
      },
      select: {
        name: true,
        code: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json(clients);
  }),
  'strict'
);
