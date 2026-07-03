import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { logger } from '@/lib/logger';
import { srService } from '@/services/sr.service';

// 단일 응답으로 메모리에 적재하므로 방어적 상한을 둔다.
const EXPORT_ROW_LIMIT = 50000;

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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { roles } = session.user;
    const isAdminOrManager = roles.some((role) => ['ADMIN', 'MANAGER'].includes(role));
    const isEngineer = roles.includes('ENGINEER');

    if (!isAdminOrManager && !isEngineer) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // 데이터 격리: ENGINEER 는 자신에게 배정된 SR 만 내보낼 수 있다(canReadSR 정책과 일치).
    // ADMIN/MANAGER 는 전체 조회 가능.
    const where: Prisma.SRWhereInput = isAdminOrManager ? {} : { assigneeId: session.user.id };

    const srs = await srService.getAllSRs({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_LIMIT,
    });

    if (!srs || srs.length === 0) {
      return new NextResponse('No data found', { status: 404 });
    }

    if (srs.length === EXPORT_ROW_LIMIT) {
      logger.warn('[Export] 결과가 상한에 도달하여 잘렸을 수 있습니다.', {
        limit: EXPORT_ROW_LIMIT,
        userId: session.user.id,
      });
    }

    const headers = [
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

    const rows = srs.map((sr) => {
      let processingTime = '';
      if (sr.completedAt && sr.createdAt) {
        const diff = new Date(sr.completedAt).getTime() - new Date(sr.createdAt).getTime();
        processingTime = (diff / (1000 * 60 * 60)).toFixed(1);
      }

      return [
        csvCell(sr.srNumber),
        csvCell(sr.title),
        csvCell(sr.status),
        csvCell(sr.priority),
        csvCell(sr.client?.name || ''),
        csvCell(sr.requester?.name || ''),
        csvCell(sr.assignee?.name || '미지정'),
        csvCell(sr.serviceCategory?.categoryName || ''),
        csvCell(sr.createdAt ? new Date(sr.createdAt).toLocaleDateString('ko-KR') : ''),
        csvCell(sr.completedAt ? new Date(sr.completedAt).toLocaleDateString('ko-KR') : ''),
        csvCell(processingTime),
      ].join(',');
    });

    const BOM = '﻿';
    const csvContent = BOM + headers.map(csvCell).join(',') + '\n' + rows.join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sr_report_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    logger.error('[Export] SR CSV 내보내기 실패', error instanceof Error ? error : undefined);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
