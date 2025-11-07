import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const clientUpdateSchema = z.object({
  code: z.string().min(2, "고객사 코드는 최소 2자 이상이어야 합니다.").optional(),
  name: z.string().min(2, "고객사 이름은 최소 2자 이상이어야 합니다.").optional(),
  industry: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email("유효한 이메일 주소를 입력하세요.").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// GET /api/clients/[id] - 특정 고객사 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await prisma.client.findUnique({
      where: { id: params.id },
      include: {
        serviceCategories: true,
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        srs: {
          take: 10,
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "고객사를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("Error fetching client:", error);
    return NextResponse.json(
      { error: "고객사 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/clients/[id] - 고객사 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = clientUpdateSchema.parse(body);

    // Check if client exists
    const existingClient = await prisma.client.findUnique({
      where: { id: params.id },
    });

    if (!existingClient) {
      return NextResponse.json(
        { error: "고객사를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // If code is being changed, check for duplicates
    if (validated.code && validated.code !== existingClient.code) {
      const duplicateClient = await prisma.client.findUnique({
        where: { code: validated.code },
      });

      if (duplicateClient) {
        return NextResponse.json(
          { error: "이미 존재하는 고객사 코드입니다." },
          { status: 400 }
        );
      }
    }

    const updateData: any = {
      ...validated,
    };

    // Handle date conversions
    if (validated.contractStartDate !== undefined) {
      updateData.contractStartDate = validated.contractStartDate
        ? new Date(validated.contractStartDate)
        : null;
    }

    if (validated.contractEndDate !== undefined) {
      updateData.contractEndDate = validated.contractEndDate
        ? new Date(validated.contractEndDate)
        : null;
    }

    // Handle empty email
    if (validated.contactEmail === "") {
      updateData.contactEmail = null;
    }

    const client = await prisma.client.update({
      where: { id: params.id },
      data: updateData,
      include: {
        serviceCategories: true,
      },
    });

    return NextResponse.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Error updating client:", error);
    return NextResponse.json(
      { error: "고객사 수정 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/[id] - 고객사 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if client exists
    const existingClient = await prisma.client.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            users: true,
            srs: true,
          },
        },
      },
    });

    if (!existingClient) {
      return NextResponse.json(
        { error: "고객사를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Check if client has associated users or SRs
    if (existingClient._count.users > 0 || existingClient._count.srs > 0) {
      return NextResponse.json(
        {
          error: "사용자 또는 SR이 연결된 고객사는 삭제할 수 없습니다.",
        },
        { status: 400 }
      );
    }

    await prisma.client.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "고객사가 삭제되었습니다." });
  } catch (error) {
    console.error("Error deleting client:", error);
    return NextResponse.json(
      { error: "고객사 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
