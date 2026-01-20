import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { srService } from '@/services/sr.service';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { roles } = session.user;
    const canExport = roles.some((role) => ['ADMIN', 'MANAGER', 'ENGINEER'].includes(role));

    if (!canExport) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // For export, we might want to apply filters from query params in the future.
    // For now, export all SRs sorted by creation date descending.
    const srs = await srService.getAllSRs({
      orderBy: { createdAt: 'desc' },
      // Fetching all records - caution with large datasets, but ok for now.
    });

    // Validating data before map
    if (!srs || srs.length === 0) {
      return new NextResponse('No data found', { status: 404 });
    }

    // Define CSV Header
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

    // Map data to CSV rows
    const rows = srs.map((sr) => {
      // Calculate processing time if completed
      let processingTime = '';
      if (sr.completedAt && sr.createdAt) {
        const diff = new Date(sr.completedAt).getTime() - new Date(sr.createdAt).getTime();
        processingTime = (diff / (1000 * 60 * 60)).toFixed(1);
      }

      return [
        sr.srNumber,
        `"${sr.title.replace(/"/g, '""')}"`, // Escape quotes
        sr.status,
        sr.priority,
        `"${sr.client?.name || ''}"`,
        `"${sr.requester?.name || ''}"`,
        `"${sr.assignee?.name || '미지정'}"`,
        `"${sr.serviceCategory?.categoryName || ''}"`,
        sr.createdAt ? new Date(sr.createdAt).toLocaleDateString('ko-KR') : '',
        sr.completedAt ? new Date(sr.completedAt).toLocaleDateString('ko-KR') : '',
        processingTime,
      ].join(',');
    });

    // BOM for Excel to recognize UTF-8
    const BOM = '\uFEFF';
    const csvContent = BOM + headers.join(',') + '\n' + rows.join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sr_report_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
