import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { priorityLabels, statusLabelOf } from '@/lib/constants/sr';
import { logger } from '@/lib/logger';
import { SR_ALIVE } from '@/lib/prisma-selects';
import { formatAppZoneDate, formatISODateInAppZone } from '@/lib/timezone';
import { srService } from '@/services/sr.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 방어적 상한. 이 이상은 잘라내고 경고 로그를 남긴다. */
const EXPORT_ROW_LIMIT = 50000;

/**
 * 한 번에 DB 에서 끌어올 행 수.
 *
 * 예전에는 5만 행을 한 번에 하이드레이트해서 (1) Prisma 객체 배열, (2) 문자열 배열,
 * (3) join 한 거대 단일 문자열 — **세 사본이 동시에** 힙에 존재했다. 컨테이너 힙 상한이
 * 450MB 라 동시 2~3건이면 OOM-kill 로 사이트 전체가 내려갔다(감사 3.39).
 * 배치 단위로 흘려보내면 피크 힙이 O(배치)로 고정된다.
 */
const BATCH_SIZE = 1000;

const HEADERS = [
  'SR 번호',
  '제목',
  '상태',
  '우선순위',
  '고객사',
  '요청자',
  '담당자',
  '서비스 카테고리',
  '접수일',
  '완료일',
  '처리시간(시간)',
];

/**
 * CSV 셀 이스케이프 + 수식 인젝션(=,+,-,@ 등으로 시작하는 값) 방어.
 */
function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

type ExportRow = Awaited<ReturnType<typeof srService.getAllSRs>>[number];

function toCsvLine(sr: ExportRow): string {
  let processingTime = '';
  if (sr.completedAt && sr.createdAt) {
    const diff = new Date(sr.completedAt).getTime() - new Date(sr.createdAt).getTime();
    processingTime = (diff / (1000 * 60 * 60)).toFixed(1);
  }

  return [
    csvCell(sr.srNumber),
    csvCell(sr.title),
    csvCell(statusLabelOf(sr.status)),
    csvCell(priorityLabels[sr.priority] ?? sr.priority),
    csvCell(sr.client?.name || ''),
    csvCell(sr.requester?.name || ''),
    csvCell(sr.assignee?.name || '미지정'),
    csvCell(sr.serviceCategory?.categoryName || ''),
    // 타임존을 명시하지 않으면 UTC 컨테이너에서 날짜가 하루 밀린다(감사 3.25).
    csvCell(sr.createdAt ? formatAppZoneDate(sr.createdAt) : ''),
    csvCell(sr.completedAt ? formatAppZoneDate(sr.completedAt) : ''),
    csvCell(processingTime),
  ].join(',');
}

// GET /api/reports/export - SR 목록 CSV 내보내기 (Rate Limit: 엄격)
export const GET = withAuthAndRateLimit(
  async (_request: NextRequest, { session }) => {
    const { roles } = session.user;
    const isAdminOrManager = roles.some((role) => ['ADMIN', 'MANAGER'].includes(role));
    const isEngineer = roles.includes('ENGINEER');

    if (!isAdminOrManager && !isEngineer) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // 데이터 격리: ENGINEER 는 자신에게 배정된 SR 만 내보낼 수 있다(canReadSR 정책과 일치).
    // ADMIN/MANAGER 는 전체 조회 가능.
    const where: Prisma.SRWhereInput = isAdminOrManager
      ? { ...SR_ALIVE }
      : { ...SR_ALIVE, assigneeId: session.user.id };

    const encoder = new TextEncoder();
    const userId = session.user.id;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // BOM + 헤더 행. 결과가 없어도 헤더만 담긴 200 을 돌려준다.
          // (예전에는 404 + 'No data found' 라 UI 가 '내보내기 실패'로 표시했다 —
          //  정직한 답을 하드 실패로 둔갑시키는 잘못된 HTTP 시맨틱이었다.)
          controller.enqueue(encoder.encode('﻿' + HEADERS.map(csvCell).join(',') + '\n'));

          let skip = 0;
          let exported = 0;

          for (;;) {
            const take = Math.min(BATCH_SIZE, EXPORT_ROW_LIMIT - exported);
            if (take <= 0) break;

            const batch = await srService.getAllSRs({
              where,
              orderBy: { createdAt: 'desc' },
              skip,
              take,
            });

            if (batch.length === 0) break;

            // 배치를 문자열로 만들어 즉시 흘려보내고 참조를 놓는다.
            controller.enqueue(encoder.encode(batch.map(toCsvLine).join('\n') + '\n'));

            exported += batch.length;
            skip += batch.length;

            if (batch.length < take) break;
          }

          if (exported >= EXPORT_ROW_LIMIT) {
            logger.warn('[Export] 결과가 상한에 도달하여 잘렸을 수 있습니다.', {
              limit: EXPORT_ROW_LIMIT,
              userId,
            });
          }

          controller.close();
        } catch (error) {
          logger.error('[Export] SR CSV 내보내기 실패', error instanceof Error ? error : undefined);
          // 헤더는 이미 전송됐을 수 있으므로 상태 코드를 바꿀 수 없다.
          // 스트림을 에러로 끝내면 클라이언트가 불완전한 다운로드를 감지한다.
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sr_report_${formatISODateInAppZone()}.csv"`,
        // SR 제목·고객사명·요청자명이 담긴 파일이다. 중간 프록시나 브라우저 디스크
        // 캐시에 남지 않게 한다.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
  // 요청당 최대 5만 행을 훑는 무거운 경로다. 예전에는 어떤 레이트리밋도 없어
  // 인증된 사용자 1명이 분당 100회까지 발행할 수 있었다.
  { preset: 'strict' }
);
