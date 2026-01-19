// Permission check API endpoint
// This endpoint validates whether the current authenticated user has a specific permission.
// It centralizes permission logic by delegating to PermissionService.

import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BadRequestError } from '@/lib/errors';
import { PermissionService } from '@/services/permission.service';

export const runtime = 'nodejs'; // Ensure Prisma works
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/permissions/check
 * Body: { resource: string, action: string }
 * Returns: { hasPermission: boolean }
 */
export const POST = withAuthAndRateLimit(
  async (request: NextRequest, { session }) => {
    const { resource, action } = await request.json();
    if (!resource || !action) {
      throw new BadRequestError('리소스와 액션을 제공해야 합니다');
    }

    const permissionService = new PermissionService();
    const hasPermission = await permissionService.checkPermission(
      session.user.id,
      `${resource}:${action}`
    );

    return NextResponse.json({ hasPermission });
  },
  { preset: 'standard' }
); // 1 minute per 100 requests
