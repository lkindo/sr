import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

const userUpdateSchema = z.object({
  name: z.string().min(2, "이름은 최소 2자 이상이어야 합니다.").optional(),
  email: z.string().email("유효한 이메일 주소를 입력해주세요.").optional(),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다.").optional(),
  isActive: z.boolean().optional(),
  userType: z.enum(["ENGINEER", "CLIENT"]).optional(),
  clientIds: z.array(z.string()).optional(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// GET /api/users/[id] - 사용자 상세 조회
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        clients: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "사용자 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/users/[id] - 사용자 수정
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = userUpdateSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 이메일 변경 시 중복 체크
    if (validated.email && validated.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: validated.email },
      });

      if (emailExists) {
        return NextResponse.json(
          { error: "이미 사용 중인 이메일입니다." },
          { status: 400 }
        );
      }
    }

    // 고객사 사용자 검증
    if (validated.userType === "CLIENT" && validated.clientIds && validated.clientIds.length === 0) {
      return NextResponse.json(
        { error: "고객사 사용자는 최소 1개 이상의 고객사를 선택해야 합니다." },
        { status: 400 }
      );
    }

    const updateData: any = {};

    if (validated.name) updateData.name = validated.name;
    if (validated.email) updateData.email = validated.email;
    if (validated.isActive !== undefined) updateData.isActive = validated.isActive;

    // 비밀번호 변경 시 해싱
    if (validated.password) {
      updateData.password = await hash(validated.password, 10);
    }

    // 고객사 업데이트 (clientIds가 제공된 경우)
    if (validated.clientIds !== undefined) {
      // 기존 고객사 연결 삭제 후 새로 생성
      await prisma.userClient.deleteMany({
        where: { userId: id },
      });

      if (validated.clientIds.length > 0) {
        await prisma.userClient.createMany({
          data: validated.clientIds.map((clientId) => ({
            userId: id,
            clientId: clientId,
          })),
        });
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        updatedAt: true,
        clients: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues?.[0];
      return NextResponse.json(
        { error: firstError?.message || "유효성 검사 실패" },
        { status: 400 }
      );
    }

    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "사용자 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id] - 사용자 삭제 (비활성화)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 본인은 삭제할 수 없음
    if (session.user.id === id) {
      return NextResponse.json(
        { error: "본인 계정은 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 실제로는 삭제하지 않고 비활성화
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: "사용자가 비활성화되었습니다." });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "사용자 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}


