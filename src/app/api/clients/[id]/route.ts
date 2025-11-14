import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { withAuthAndRateLimit } from "@/lib/auth-wrapper";
import { NotFoundError, BadRequestError, ValidationError } from "@/lib/errors";

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

// GET /api/clients/[id] - 고객사 상세 조회 (Rate Limit: 표준)
export const GET = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

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
    throw new NotFoundError("고객사를 찾을 수 없습니다.");
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
}, { preset: 'standard' }); // 1분당 100회

// PATCH /api/clients/[id] - 고객사 수정 (Rate Limit: 엄격)
export const PATCH = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;
  const body = await request.json();

  let validated;
  try {
    validated = clientSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues[0].message);
    }
    throw error;
  }

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
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)

// DELETE /api/clients/[id] - 고객사 삭제 (Rate Limit: 엄격)
export const DELETE = withAuthAndRateLimit(async (
  request: NextRequest,
  { params }: { session: any; params: RouteContext["params"] }
) => {
  const { id } = await params;

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
    throw new NotFoundError("고객사를 찾을 수 없습니다.");
  }

  if (client._count.users > 0 || client._count.srs > 0) {
    throw new BadRequestError("연결된 사용자 또는 SR이 있어 삭제할 수 없습니다.");
  }

  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ success: true });
}, { preset: 'strict' }); // 1분당 5회 (민감한 작업)
