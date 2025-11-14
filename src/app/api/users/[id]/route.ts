import { NextRequest, NextResponse } from "next/server";
import { UserService } from "@/services/user.service";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import { z } from "zod";
import { userUpdateSchema } from "@/lib/schemas";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/users/[id] - 사용자 상세 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  const userService = new UserService();
  const user = await userService.getUserById(id);

  if (!user) {
    throw new NotFoundError("사용자를 찾을 수 없습니다.");
  }

  return NextResponse.json(user);
}, { preset: 'standard' }); // 1분당 100회

// PATCH /api/users/[id] - 사용자 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;
  const body = await request.json();

  let validated;
  try {
    validated = userUpdateSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }

  const userService = new UserService();
  const user = await userService.updateUser(id, validated);

  return NextResponse.json(user);
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

// DELETE /api/users/[id] - 사용자 삭제 (비활성화) (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(async (
  request: NextRequest,
  { session, params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

  if (session.user.id === id) {
    throw new BusinessRuleError("본인 계정은 삭제할 수 없습니다.");
  }

  const userService = new UserService();
  await userService.deactivateUser(id);

  return NextResponse.json({ message: "사용자가 비활성화되었습니다." });
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)


