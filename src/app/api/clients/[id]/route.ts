import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const clientSchema = z.object({
  code: z.string().min(2).optional(),
  name: z.string().min(2).optional(),
  industry: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 고객사 정보와 전체 서비스 카테고리를 병렬로 조회
    const [client, allServiceCategories] = await Promise.all([
      prisma.client.findUnique({
        where: { id },
        include: {
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  roles: {
                    include: {
                      role: {
                        select: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          srs: {
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              srNumber: true,
              title: true,
              status: true,
              priority: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              users: true,
              srs: true,
            },
          },
        },
      }),
      // 모든 활성화된 서비스 카테고리 조회
      prisma.serviceCategory.findMany({
        where: { isActive: true },
        include: {
          handler: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          backupHandler: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { categoryName: "asc" },
      }),
    ]);

    if (!client) {
      return NextResponse.json({ error: "고객사를 찾을 수 없습니다." }, { status: 404 });
    }

    // ADMIN 역할을 가진 사용자 제외
    const filteredUsers = client.users.filter((userClient) => {
      const hasAdminRole = userClient.user.roles.some(
        (userRole) => userRole.role.name === "ADMIN"
      );
      return !hasAdminRole;
    });

    // 고객사 정보에 전체 서비스 카테고리 추가 및 필터링된 사용자로 대체
    const clientWithCategories = {
      ...client,
      users: filteredUsers,
      serviceCategories: allServiceCategories,
    };

    return NextResponse.json(clientWithCategories);
  } catch (error) {
    console.error("Error fetching client:", error);
    return NextResponse.json({ error: "오류가 발생했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = clientSchema.parse(body);

    const updateData: any = {};
    if (validated.code) updateData.code = validated.code;
    if (validated.name) updateData.name = validated.name;
    if (validated.industry !== undefined) updateData.industry = validated.industry;
    if (validated.contactPerson !== undefined) updateData.contactPerson = validated.contactPerson;
    if (validated.contactEmail !== undefined) updateData.contactEmail = validated.contactEmail || null;
    if (validated.contactPhone !== undefined) updateData.contactPhone = validated.contactPhone;
    if (validated.address !== undefined) updateData.address = validated.address;
    if (validated.isActive !== undefined) updateData.isActive = validated.isActive;

    if (validated.contractStartDate !== undefined) {
      updateData.contractStartDate = validated.contractStartDate ? new Date(validated.contractStartDate) : null;
    }
    if (validated.contractEndDate !== undefined) {
      updateData.contractEndDate = validated.contractEndDate ? new Date(validated.contractEndDate) : null;
    }

    // 고객사 업데이트와 전체 서비스 카테고리를 병렬로 조회
    const [client, allServiceCategories] = await Promise.all([
      prisma.client.update({
        where: { id },
        data: updateData,
        include: {
          _count: {
            select: {
              users: true,
              srs: true,
            },
          },
        },
      }),
      // 모든 활성화된 서비스 카테고리 조회
      prisma.serviceCategory.findMany({
        where: { isActive: true },
        include: {
          handler: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          backupHandler: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { categoryName: "asc" },
      }),
    ]);

    // 고객사 정보에 전체 서비스 카테고리 추가
    const clientWithCategories = {
      ...client,
      serviceCategories: allServiceCategories,
    };

    return NextResponse.json(clientWithCategories);
  } catch (error) {
    console.error("Error updating client:", error);
    return NextResponse.json({ error: "오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            srs: true,
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "고객사를 찾을 수 없습니다." }, { status: 404 });
    }

    if (client._count.users > 0 || client._count.srs > 0) {
      return NextResponse.json({
        error: "연결된 사용자 또는 SR이 있어 삭제할 수 없습니다.",
      }, { status: 400 });
    }

    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json({ error: "오류가 발생했습니다." }, { status: 500 });
  }
}
