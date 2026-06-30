import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/health - DB 연결 상태 확인 (공개 엔드포인트: 최소 정보만 노출)
// 보안: DB 서버 시간/원시 쿼리 결과/드라이버 에러 메시지를 외부에 노출하지 않는다.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error(
      '[health] Database health check failed',
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { status: 'unhealthy', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
