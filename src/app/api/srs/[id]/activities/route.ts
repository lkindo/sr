import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { withAuthAndRateLimit, AuthenticatedContext } from "@/lib/auth-wrapper";
import { NotFoundError } from "@/lib/errors";
import { RouteContext } from "@/lib/api-helpers";

// GET /api/srs/[id]/activities - SR 활동 이력 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: AuthenticatedContext<RouteContext<{ id: string }>["params"]>
) => {
  const { id } = await params;

  const activities = await prisma.sRActivity.findMany({
    where: { srId: id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!activities) {
    throw new NotFoundError("활동 이력을 찾을 수 없습니다.");
  }

  return NextResponse.json(activities);
}, { preset: 'standard' }); // 1분당 100회
