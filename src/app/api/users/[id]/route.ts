import { NextRequest, NextResponse } from 'next/server';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { ensureCanDeleteUser, ensureCanReadUser, ensureCanUpdateUser } from '@/lib/policies';
import { userUpdateSchema } from '@/lib/schemas';
import { UserService } from '@/services/user.service';

// GET /api/users/[id] - 사용자 상세 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;

    const userService = new UserService();
    const user = await userService.getUserById(id);

    if (!user) {
      throw new NotFoundError('사용자');
    }

    // 권한 체크: 관리자 / USER:READ 권한자 / 본인만 조회 가능
    ensureCanReadUser(session.user, user);

    return NextResponse.json(user);
  },
  { preset: 'standard' }
); // 1분당 100회

// PATCH /api/users/[id] - 사용자 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;
    const validated = await validateRequestBody(request, userUpdateSchema);

    const userService = new UserService();
    const targetUser = await userService.getUserById(id);
    if (!targetUser) {
      throw new NotFoundError('사용자');
    }

    // 권한 체크: 관리자 / USER:UPDATE 권한자 / (USER:UPDATE_SELF 보유) 본인만 수정 가능
    ensureCanUpdateUser(session.user, targetUser);

    // 권한 상승/테넌트 이탈 방지: 타인을 관리할 수 없는(본인 셀프 수정) 사용자는
    // 민감 필드(email/isActive/clientIds)를 변경할 수 없고 이름/이미지만 수정 가능.
    const canManageOthers =
      session.user.roles.includes('ADMIN') ||
      hasPermissionFlag(session.user, PERMISSIONS.USER.UPDATE);
    const updateData = canManageOthers
      ? validated
      : { name: validated.name, image: validated.image };

    const user = await userService.updateUser(id, updateData, session.user.id);

    return NextResponse.json(user);
  },
  { preset: 'standard' }
); // 1분당 100회

// DELETE /api/users/[id] - 사용자 삭제 (비활성화 또는 완전 삭제) (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(
  async (
    request: NextRequest,
    { session, params }: AuthenticatedContext<RouteContext<{ id: string }>['params']>
  ) => {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const isHardDelete = searchParams.get('hard') === 'true';

    if (session.user.id === id) {
      throw new BusinessRuleError('본인 계정은 삭제할 수 없습니다.');
    }

    const userService = new UserService();
    const targetUser = await userService.getUserById(id);
    if (!targetUser) {
      throw new NotFoundError('사용자');
    }

    // 권한 체크: 관리자 / USER:DELETE 권한자만 삭제 가능
    ensureCanDeleteUser(session.user, targetUser);

    if (isHardDelete) {
      await userService.hardDeleteUser(id, session.user.id);
      return NextResponse.json({ message: '사용자가 완전히 삭제되었습니다.' });
    } else {
      await userService.deactivateUser(id, session.user.id);
      return NextResponse.json({ message: '사용자가 비활성화되었습니다.' });
    }
  },
  { preset: 'standard' }
); // 1분당 100회 (테스트 편의를 위해 완화)
