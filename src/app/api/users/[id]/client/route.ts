import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// PATCH /api/users/[id]/client - 사용자 소속 고객사 변경
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const params = await context.params;
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "인증이 필요합니다" },
                { status: 401 }
            );
        }

        const { id: userId } = params;
        const body = await request.json();
        const { clientId } = body;

        if (!clientId) {
            return NextResponse.json(
                { error: "고객사 ID가 필요합니다" },
                { status: 400 }
            );
        }

        // 권한 확인 (ADMIN, MANAGER만 가능)
        const userRoles = await prisma.userRole.findMany({
            where: { userId: session.user.id },
            include: { role: true }
        });

        const hasPermission = userRoles.some((ur: any) =>
            ['ADMIN', 'MANAGER'].includes(ur.role.name)
        );

        if (!hasPermission) {
            return NextResponse.json(
                { error: "권한이 없습니다" },
                { status: 403 }
            );
        }

        // 고객사 존재 확인
        const client = await prisma.client.findUnique({
            where: { id: clientId }
        });

        if (!client) {
            return NextResponse.json(
                { error: "고객사를 찾을 수 없습니다" },
                { status: 404 }
            );
        }

        // 기존 UserClient 관계 확인
        const existingRelation = await prisma.userClient.findFirst({
            where: { userId }
        });

        if (existingRelation) {
            // 이미 다른 고객사에 소속되어 있으면 업데이트
            await prisma.userClient.update({
                where: { id: existingRelation.id },
                data: { clientId }
            });
        } else {
            // 소속이 없으면 새로 생성
            await prisma.userClient.create({
                data: {
                    userId,
                    clientId
                }
            });
        }

        return NextResponse.json({
            success: true,
            message: "사용자 소속이 변경되었습니다"
        });

    } catch (error) {
        console.error("[PATCH /api/users/[id]/client] Error:", error);
        return NextResponse.json(
            {
                error: "사용자 소속 변경 중 오류가 발생했습니다",
                details: process.env.NODE_ENV === "development"
                    ? (error instanceof Error ? error.message : String(error))
                    : undefined
            },
            { status: 500 }
        );
    }
}
