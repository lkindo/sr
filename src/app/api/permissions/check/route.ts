// Permission check API endpoint
// This endpoint validates whether the current authenticated user has a specific permission.
// It centralizes permission logic by delegating to PermissionService.

import { NextRequest, NextResponse } from 'next/server';

import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BadRequestError } from '@/lib/errors';
import { hasPermissionFlag } from '@/lib/permission-helpers';

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

    // Optimize: Check permissions in-memory using session data
    // ADMIN has all permissions implicitly
    const hasPermission =
      session.user.roles.includes('ADMIN') ||
      hasPermissionFlag(session.user, `${resource}:${action}`);

    return NextResponse.json({ hasPermission });
  },
  { preset: 'standard' }
); // 1 minute per 100 requests
