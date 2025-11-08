import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

const clientSchema = z.object({
  code: z.string().min(2, "고객사 코드는 최소 2자 이상이어야 합니다."),
  name: z.string().min(2, "고객사 이름은 최소 2자 이상이어야 합니다."),
  industry: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email("유효한 이메일 주소를 입력하세요.").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/clients - 모든 고객사 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");

    const clients = await prisma.client.findMany({
      where: isActive !== null ? { isActive: isActive === "true" } : undefined,
      include: {
        serviceCategories: true,
        _count: {
          select: {
            users: true,
            srs: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      { error: "고객사 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/clients - 새 고객사 생성
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = clientSchema.parse(body);

    // Check if client code already exists
    const existingClient = await prisma.client.findUnique({
      where: { code: validated.code },
    });

    if (existingClient) {
      return NextResponse.json(
        { error: "이미 존재하는 고객사 코드입니다." },
        { status: 400 }
      );
    }

    const client = await prisma.client.create({
      data: {
        code: validated.code,
        name: validated.name,
        industry: validated.industry,
        contactPerson: validated.contactPerson,
        contactEmail: validated.contactEmail || undefined,
        contactPhone: validated.contactPhone,
        address: validated.address,
        contractStartDate: validated.contractStartDate
          ? new Date(validated.contractStartDate)
          : undefined,
        contractEndDate: validated.contractEndDate
          ? new Date(validated.contractEndDate)
          : undefined,
        isActive: validated.isActive ?? true,
      },
      include: {
        serviceCategories: true,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues?.[0].message },
        { status: 400 }
      );
    }

    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "고객사 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
