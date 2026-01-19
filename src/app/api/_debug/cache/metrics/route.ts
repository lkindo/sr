import { NextResponse } from 'next/server';

import { getCacheMetrics } from '@/lib/cache';

export const runtime = 'nodejs';

// GET /api/_debug/cache/metrics - 개발환경에서만 사용
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const metrics = getCacheMetrics();
  return NextResponse.json(metrics);
}
