// Permission check API endpoint
// This endpoint validates whether the current authenticated user has a specific permission.
// It centralizes permission logic by delegating to PermissionService.

import { NextRequest, NextResponse } from 'next/server';

import { parseJsonBody } from '@/lib/api-helpers';
import { withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { hasPermissionFlag } from '@/lib/permission-helpers';
import { permissionCheckSchema } from '@/lib/schemas';

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
    // 예전에는 `await request.json()` 을 곧바로 구조 분해해서, 본문이 `null` 이면
    // SyntaxError 가 아니라 TypeError 로 터지며 500 이 됐다(감사 4.3).
    const { resource, action } = permissionCheckSchema.parse(await parseJsonBody(request));

    // Optimize: Check permissions in-memory using session data
    // ADMIN has all permissions implicitly
    const hasPermission =
      session.user.roles.includes('ADMIN') ||
      hasPermissionFlag(session.user, `${resource}:${action}`);

    return NextResponse.json({ hasPermission });
  },
  { preset: 'standard' }
); // 1 minute per 100 requests
