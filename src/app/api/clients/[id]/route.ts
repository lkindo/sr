import { NextRequest, NextResponse } from 'next/server';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import {
  ensureCanDeleteClient,
  ensureCanReadClient,
  ensureCanUpdateClient,
  isInternalUser,
} from '@/lib/policies';
import { clientUpdateSchema } from '@/lib/schemas';
import { ClientService } from '@/services/client.service';

// GET /api/clients/[id] - 고객사 상세 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    // Service 레이어를 통해 고객사 조회
    const clientService = new ClientService();
    const clientWithCategories = await clientService.getClientWithDetailsAndCategories(id);

    if (!clientWithCategories) {
      throw new NotFoundError('고객사');
    }

    // Enforce authorization check
    ensureCanReadClient(session.user, clientWithCategories as any);

    return NextResponse.json(clientWithCategories);
  },
  { preset: 'standard' }
); // 1분당 100회

// PATCH /api/clients/[id] - 고객사 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    ensureCanUpdateClient(session.user);

    const { id } = await params;

    // Multi-tenant Isolation: External users cannot modify other clients
    if (!isInternalUser(session.user)) {
      const userClientIds = session.user.clientIds || [];
      if (!userClientIds.includes(id)) {
        throw new ForbiddenError('해당 고객사 수정 권한이 없습니다.');
      }
    }

    const validated = await validateRequestBody(request, clientUpdateSchema);

    // Service 레이어를 통해 고객사 수정
    const clientService = new ClientService();
    await clientService.updateClient(id, validated);

    // 수정된 고객사 정보와 서비스 카테고리 조회
    const clientWithCategories = await clientService.getClientWithDetailsAndCategories(id);

    return NextResponse.json(clientWithCategories);
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)

// DELETE /api/clients/[id] - 고객사 삭제 (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    ensureCanDeleteClient(session.user);

    const { id } = await params;

    // Service 레이어를 통해 고객사 삭제
    const clientService = new ClientService();
    await clientService.deleteClient(id);

    return NextResponse.json({ success: true });
  },
  { preset: 'strict' }
); // 1분당 5회 (민감한 작업)
