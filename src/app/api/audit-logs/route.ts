import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { usePagination } from '@/lib/pagination';
import { ensureCanViewAuditLogs } from '@/lib/policies';
import { serializeResponse } from '@/lib/serialization';
import { startOfAppZoneDay } from '@/lib/timezone';
import { auditService } from '@/services/audit.service';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

const DAY_MS = 24 * 60 * 60 * 1000;
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined),
    z.string().max(max).optional()
  );
const optionalDay = z.preprocess(
  (value) => (typeof value === 'string' && value ? value : undefined),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식이어야 합니다.')
    .optional()
);

const querySchema = z.object({
  actionType: optionalText(50),
  targetEntity: optionalText(50),
  targetId: optionalText(100),
  actor: optionalText(100),
  from: optionalDay,
  to: optionalDay,
});

/**
 * GET /api/audit-logs — 감사 로그 조회 (ADMIN 전용, 2026-09-18 소유자 결정 D11)
 *
 * 헌법 §1.1 은 ADMIN 이 전체 감사 로그를 조회할 수 있다고 규정하는데, 읽는 코드가 없어 서버에 SSH 로 들어가
 * SQL 을 쳐야 했다. 기간은 앱 시간대(KST) 달력일로 받는다 — `to` 는 그날 하루를 포함한다.
 */
export const GET = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    ensureCanViewAuditLogs(session.user);

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(searchParams.entries()));
    const { skip, take, createResponse } = usePagination(request);

    const { rows, total, facets } = await auditService.listLogs(
      {
        actionType: query.actionType,
        targetEntity: query.targetEntity,
        targetId: query.targetId,
        actor: query.actor,
        from: query.from ? startOfAppZoneDay(`${query.from}T12:00:00+09:00`) : undefined,
        to: query.to
          ? new Date(startOfAppZoneDay(`${query.to}T12:00:00+09:00`).getTime() + DAY_MS)
          : undefined,
      },
      { skip, take }
    );

    return NextResponse.json(serializeResponse({ ...createResponse(rows, total), facets }));
  },
  { preset: 'relaxed' }
);
