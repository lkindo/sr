import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

const userSchema = z.object({
  name: z.string().min(2, "이름은 최소 2자 이상이어야 합니다."),
  email: z.string().email("유효한 이메일 주소를 입력해주세요."),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다."),
  isActive: z.boolean().optional().default(true),
  userType: z.enum(["ENGINEER", "CLIENT"]).optional().default("ENGINEER"),
  clientIds: z.array(z.string()).optional().default([]),
});

// GET /api/users - 사용자 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const isActive = searchParams.get("isActive");
    const userType = searchParams.get("userType");
    const roleId = searchParams.get("roleId");

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (isActive !== null && isActive !== "") {
      where.isActive = isActive === "true";
    }

    // 역할별 필터링
    if (roleId && roleId !== "all") {
      where.roles = {
        some: {
          roleId: roleId,
        },
      };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          include: {
            role: true,
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
      orderBy: {
        createdAt: "desc",
      },
    });

    // 사용자 유형 결정 (클라이언트가 있으면 CLIENT, 없으면 ENGINEER)
    let usersWithType = users.map((user) => ({
      ...user,
      userType: user.clients.length > 0 ? "CLIENT" : "ENGINEER",
    }));

    // 유형별 필터링 (클라이언트 측에서도 가능하지만 서버에서 처리)
    if (userType && userType !== "all") {
      usersWithType = usersWithType.filter((user) => user.userType === userType);
    }

    return NextResponse.json(usersWithType);
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "사용자 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/users - 새 사용자 생성
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = userSchema.parse(body);

    // 이메일 중복 체크
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "이미 사용 중인 이메일입니다." },
        { status: 400 }
      );
    }

    // 고객사 사용자인 경우 고객사 검증
    if (validated.userType === "CLIENT" && validated.clientIds.length === 0) {
      return NextResponse.json(
        { error: "고객사 사용자는 최소 1개 이상의 고객사를 선택해야 합니다." },
        { status: 400 }
      );
    }

    // 비밀번호 해싱
    const hashedPassword = await hash(validated.password, 10);

    // 사용자 생성 (트랜잭션으로 고객사 할당까지 처리)
    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        password: hashedPassword,
        isActive: validated.isActive,
        clients: {
          create: validated.clientIds.map((clientId) => ({
            client: {
              connect: { id: clientId },
            },
          })),
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
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

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues?.[0];
      return NextResponse.json(
        { error: firstError?.message || "유효성 검사 실패" },
        { status: 400 }
      );
    }

    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "사용자 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}


