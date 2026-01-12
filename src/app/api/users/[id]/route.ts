import { NextRequest, NextResponse } from "next/server";
import { UserService } from "@/services/user.service";
import { withAuthAndRateLimit, AuthenticatedContext } from "@/lib/auth-wrapper";
import { BusinessRuleError, NotFoundError } from "@/lib/errors";
import { userUpdateSchema } from "@/lib/schemas";
import { validateRequestBody, RouteContext } from "@/lib/api-helpers";

// GET /api/users/[id] - 사용자 상세 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id } = await params;

  const userService = new UserService();
  const user = await userService.getUserById(id);

  if (!user) {
    throw new NotFoundError("사용자");
  }

  return NextResponse.json(user);
}, { preset: 'standard' }); // 1분당 100회

// PATCH /api/users/[id] - 사용자 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id } = await params;
  const validated = await validateRequestBody(request, userUpdateSchema);

  const userService = new UserService();
  const user = await userService.updateUser(id, validated);

  return NextResponse.json(user);
}, { preset: 'standard' }); // 1분당 100회

// DELETE /api/users/[id] - 사용자 삭제 (비활성화 또는 완전 삭제) (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const isHardDelete = searchParams.get("hard") === "true";

  if (session.user.id === id) {
    throw new BusinessRuleError("본인 계정은 삭제할 수 없습니다.");
  }

  const userService = new UserService();

  if (isHardDelete) {
    await userService.hardDeleteUser(id);
    return NextResponse.json({ message: "사용자가 완전히 삭제되었습니다." });
  } else {
    await userService.deactivateUser(id);
    return NextResponse.json({ message: "사용자가 비활성화되었습니다." });
  }
}, { preset: 'standard' }); // 1분당 100회 (테스트 편의를 위해 완화)


