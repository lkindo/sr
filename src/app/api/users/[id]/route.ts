import { NextRequest, NextResponse } from 'next/server';

import { RouteContext, validateRequestBody } from '@/lib/api-helpers';
import { AuthenticatedContext, withAuthAndRateLimit } from '@/lib/auth-wrapper';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '@/lib/errors';
import {
  canManageSensitiveUserFields,
  ensureCanDeleteUser,
  ensureCanReadUser,
  ensureCanUpdateUser,
  isInternalUser,
} from '@/lib/policies';
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
    const canManageOthers = canManageSensitiveUserFields(session.user, targetUser);

    // 비밀번호 재설정은 관리자 전용 경로다.
    // 본인 변경은 현재 비밀번호를 요구하는 POST /api/profile/password 를 거쳐야 하므로,
    // 이 라우트로 자기 비밀번호를 바꿀 수 있으면 그 확인 절차를 우회하게 된다.
    // 조용히 버리면 호출자가 성공(200)으로 읽고 바뀐 줄 알기 때문에 명시적으로 거부한다.
    if (validated.password !== undefined && !canManageOthers) {
      throw new ForbiddenError(
        '비밀번호를 변경할 권한이 없습니다. 본인 비밀번호는 프로필 > 비밀번호 변경에서 현재 비밀번호와 함께 변경하세요.'
      );
    }

    // Multi-tenant Isolation: 고객사 소속(clientIds) 변경은 내부 사용자(ADMIN/MANAGER/ENGINEER)만 가능.
    // 외부 사용자(예: CLIENT_ADMIN)가 타 테넌트를 추가하면 권한 상승이 되므로 차단한다.
    //
    // 조용히 필드만 버리면 호출자는 성공(200)으로 읽고 변경된 줄 안다.
    // 다만 UserDialog 는 편집 시 항상 clientIds 를 함께 보내므로, 무조건 거부하면
    // 자기 테넌트 내 정상 편집까지 막힌다. 따라서 "실제로 바꾸려 한 경우"에만 거부한다.
    if (!isInternalUser(session.user) && validated.clientIds !== undefined) {
      const currentClientIds = targetUser.clients.map((c) => c.clientId);
      const isUnchanged =
        validated.clientIds.length === currentClientIds.length &&
        [...validated.clientIds].sort().every((id, i) => id === [...currentClientIds].sort()[i]);

      if (!isUnchanged) {
        throw new ForbiddenError('고객사 소속은 변경할 수 없습니다.');
      }
    }

    const updateData: typeof validated = canManageOthers
      ? { ...validated }
      : { name: validated.name, image: validated.image };

    // 외부 사용자가 동일한 소속을 다시 보낸 no-op은 허용하되 재작성은 하지 않는다.
    if (!isInternalUser(session.user)) delete updateData.clientIds;

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
      if (!session.user.roles.includes('ADMIN')) {
        throw new ForbiddenError('사용자 완전 삭제는 ADMIN만 수행할 수 있습니다.');
      }
      await userService.hardDeleteUser(id, session.user.id);
      return NextResponse.json({ message: '사용자가 완전히 삭제되었습니다.' });
    } else {
      await userService.deactivateUser(id, session.user.id);
      return NextResponse.json({ message: '사용자가 비활성화되었습니다.' });
    }
  },
  { preset: 'standard' }
); // 1분당 100회 (테스트 편의를 위해 완화)
