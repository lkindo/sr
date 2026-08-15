import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/auth-wrapper';
import prisma from '@/lib/prisma';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

/**
 * 공개 API: 활성 고객사 목록 조회 (회원가입용)
 * 인증 불필요 - 회원가입 시 고객사 선택을 위한 공개 API
 *
 * 인증은 없지만 래퍼는 경유한다 — be-rules §1 은 성능 계측에 예외를 두지 않으며,
 * 오류를 500 으로 뭉개지 않고 `handleApiError` 가 매핑하게 한다(감사 D-11).
 */
export const GET = withErrorHandler(async (_request: NextRequest) => {
  const clients = await prisma.client.findMany({
    where: {
      isActive: true, // 활성 고객사만
    },
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  return NextResponse.json(clients);
});
