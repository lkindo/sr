import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// DELETE /api/users/[id]/client - 사용자 소속 고객사 해제
export async function DELETE(
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

        // 권한 확인 (ADMIN, MANAGER만 가능)
        const userRoles = await prisma.userRole.findMany({
            where: { userId: session.user.id },
            include: { role: true }
        });

        const hasPermission = userRoles.some((ur) =>
            ['ADMIN', 'MANAGER'].includes(ur.role.name)
        );

        if (!hasPermission) {
            return NextResponse.json(
                { error: "권한이 없습니다" },
                { status: 403 }
            );
        }

        // 기존 UserClient 관계 확인 및 삭제
        const existingRelation = await prisma.userClient.findFirst({
            where: { userId }
        });

        if (!existingRelation) {
            return NextResponse.json(
                { error: "소속된 고객사가 없습니다" },
                { status: 404 }
            );
        }

        // 고객사 팀 역할을 가진 사용자는 고객사 할당을 해제할 수 없음
        const targetUserRoles = await prisma.userRole.findMany({
            where: { userId },
            include: { role: true }
        });

        const hasClientTeamRole = targetUserRoles.some((ur) =>
            ['CLIENT_ADMIN', 'CLIENT_USER'].includes(ur.role.name)
        );

        if (hasClientTeamRole) {
            const clientRoles = targetUserRoles
                .filter((ur) => ['CLIENT_ADMIN', 'CLIENT_USER'].includes(ur.role.name))
                .map((ur) => ur.role.name);

            return NextResponse.json(
                {
                    error: "고객사 팀 역할을 가진 사용자는 고객사 할당을 해제할 수 없습니다",
                    details: `현재 역할: ${clientRoles.join(', ')}`,
                    suggestion: "먼저 고객사 팀 역할을 제거한 후 고객사 할당을 해제하세요.",
                    clientRoles
                },
                { status: 400 }
            );
        }

        await prisma.userClient.delete({
            where: { id: existingRelation.id }
        });

        return NextResponse.json({
            success: true,
            message: "고객사 소속이 해제되었습니다"
        });

    } catch (error) {
        console.error("[DELETE /api/users/[id]/client] Error:", error);
        return NextResponse.json(
            {
                error: "고객사 소속 해제 중 오류가 발생했습니다",
                details: process.env.NODE_ENV === "development"
                    ? (error instanceof Error ? error.message : String(error))
                    : undefined
            },
            { status: 500 }
        );
    }
}

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

        const hasPermission = userRoles.some((ur) =>
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

        // 대상 사용자의 역할 확인 - 시스템 운영팀은 고객사 할당 불가
        const targetUserRoles = await prisma.userRole.findMany({
            where: { userId },
            include: { role: true }
        });

        const isSystemTeam = targetUserRoles.some((ur) =>
            ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name)
        );

        if (isSystemTeam) {
            const systemRoles = targetUserRoles
                .filter((ur) => ['ADMIN', 'MANAGER', 'ENGINEER'].includes(ur.role.name))
                .map((ur) => ur.role.name)
                .join(', ');

            return NextResponse.json(
                {
                    error: "시스템 운영팀(ADMIN, MANAGER, ENGINEER)은 고객사를 할당할 수 없습니다",
                    details: `현재 역할: ${systemRoles}`
                },
                { status: 400 }
            );
        }

        // 기존 UserClient 관계 확인
        const existingRelation = await prisma.userClient.findFirst({
            where: { userId },
            include: {
                client: {
                    select: { id: true, name: true }
                }
            }
        });

        // 진행 중인 SR 확인 (요청자, 담당자, 접수자로 참여 중인 SR)
        const ongoingSRs = await prisma.sR.findMany({
            where: {
                OR: [
                    { requesterId: userId },
                    { assigneeId: userId },
                    { intakeById: userId }
                ],
                status: {
                    in: ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD']
                },
                ...(existingRelation ? { clientId: existingRelation.clientId } : {})
            },
            select: {
                id: true,
                srNumber: true,
                title: true,
                status: true,
                priority: true,
                client: {
                    select: { name: true }
                },
                assignee: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // 강제 이동 플래그 확인
        const { force } = body;

        // 진행 중인 SR이 있고 강제 이동이 아니면 경고 반환
        if (ongoingSRs.length > 0 && !force) {
            return NextResponse.json({
                success: false,
                warning: true,
                message: "진행 중인 SR이 있습니다",
                data: {
                    ongoingSRs: ongoingSRs.map(sr => ({
                        id: sr.id,
                        srNumber: sr.srNumber,
                        title: sr.title,
                        status: sr.status,
                        priority: sr.priority,
                        clientName: sr.client.name,
                        assigneeName: sr.assignee?.name
                    })),
                    ongoingSRCount: ongoingSRs.length,
                    sourceClient: existingRelation?.client,
                    targetClient: { id: client.id, name: client.name }
                }
            }, { status: 200 });
        }

        // UserClient 관계 업데이트 또는 생성
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
            message: "사용자 소속이 변경되었습니다",
            data: {
                userId,
                newClientId: clientId,
                newClientName: client.name,
                ongoingSRsHandled: ongoingSRs.length
            }
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
