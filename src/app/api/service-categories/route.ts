import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth-wrapper';
import { serviceCategoryService } from '@/services/service-category.service';

// GET /api/service-categories - 모든 활성 서비스 카테고리 조회
export const GET = withAuth(async (_request: NextRequest) => {
  const categories = await serviceCategoryService.getAll();

  return NextResponse.json(categories);
});
