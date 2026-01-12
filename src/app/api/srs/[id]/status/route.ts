import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { SRService } from "@/services/sr.service";
import { z } from "zod";
import { SRStatus } from "@prisma/client";

const statusActionSchema = z.object({
    action: z.enum([
        "complete",
        "hold",
        "reject",
        "reopen",
        "start",
        "resume",
        "confirm",
    ]),
    reason: z.string().optional(),
    resolutionDescription: z.string().optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
        }

        const { id: srId } = await params;
        const body = await request.json();

        // 입력 검증
        const validationResult = statusActionSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json(
                { error: "잘못된 요청입니다.", details: validationResult.error },
                { status: 400 }
            );
        }

        const { action, reason, resolutionDescription } = validationResult.data;

        const srService = new SRService();

        // 현재 SR 조회
        const currentSR = await srService.getSRById(srId);
        if (!currentSR) {
            return NextResponse.json(
                { error: "SR을 찾을 수 없습니다." },
                { status: 404 }
            );
        }

        const currentStatus = currentSR.status;
        let newStatus: SRStatus;

        interface UpdateData {
            resolutionDescription?: string;
            rejectionReason?: string;
            completedAt?: Date;
        }
        const updateData: UpdateData = {};

        // 액션에 따른 상태 전이
        switch (action) {
            case "start":
                // INTAKE → IN_PROGRESS
                if (currentStatus !== "INTAKE") {
                    return NextResponse.json(
                        { error: "접수 상태에서만 진행을 시작할 수 있습니다." },
                        { status: 400 }
                    );
                }
                newStatus = "IN_PROGRESS";
                break;

            case "complete":
                // IN_PROGRESS → COMPLETED
                if (currentStatus !== "IN_PROGRESS") {
                    return NextResponse.json(
                        { error: "진행중 상태에서만 완료 처리할 수 있습니다." },
                        { status: 400 }
                    );
                }
                if (!resolutionDescription) {
                    return NextResponse.json(
                        { error: "해결 내용을 입력해주세요." },
                        { status: 400 }
                    );
                }
                newStatus = "COMPLETED";
                updateData.resolutionDescription = resolutionDescription;
                updateData.completedAt = new Date();
                break;

            case "hold":
                // IN_PROGRESS → ON_HOLD (INTAKE에서는 보류 불가)
                if (currentStatus !== "IN_PROGRESS") {
                    return NextResponse.json(
                        { error: "진행중 상태에서만 보류할 수 있습니다." },
                        { status: 400 }
                    );
                }
                if (!reason) {
                    return NextResponse.json(
                        { error: "보류 사유를 입력해주세요." },
                        { status: 400 }
                    );
                }
                newStatus = "ON_HOLD";
                break;

            case "resume":
                // ON_HOLD → IN_PROGRESS
                if (currentStatus !== "ON_HOLD") {
                    return NextResponse.json(
                        { error: "보류 상태에서만 재개할 수 있습니다." },
                        { status: 400 }
                    );
                }
                newStatus = "IN_PROGRESS";
                break;

            case "reject":
                // REQUESTED/INTAKE/ON_HOLD → REJECTED
                if (!["REQUESTED", "INTAKE", "ON_HOLD"].includes(currentStatus)) {
                    return NextResponse.json(
                        { error: "요청됨, 접수, 보류 상태에서만 거절할 수 있습니다." },
                        { status: 400 }
                    );
                }
                if (!reason) {
                    return NextResponse.json(
                        { error: "거절 사유를 입력해주세요." },
                        { status: 400 }
                    );
                }
                newStatus = "REJECTED";
                updateData.rejectionReason = reason;
                break;

            case "confirm":
                // COMPLETED → CONFIRMED (신청자만 가능)
                if (currentStatus !== "COMPLETED") {
                    return NextResponse.json(
                        { error: "완료 상태에서만 확인할 수 있습니다." },
                        { status: 400 }
                    );
                }
                if (currentSR.requesterId !== session.user.id) {
                    return NextResponse.json(
                        { error: "신청자만 확인할 수 있습니다." },
                        { status: 403 }
                    );
                }
                newStatus = "CONFIRMED";
                break;

            case "reopen":
                // COMPLETED/CONFIRMED → IN_PROGRESS (7일 이내)
                if (!["COMPLETED", "CONFIRMED"].includes(currentStatus)) {
                    return NextResponse.json(
                        { error: "완료 또는 확인완료 상태에서만 재오픈할 수 있습니다." },
                        { status: 400 }
                    );
                }
                if (!reason) {
                    return NextResponse.json(
                        { error: "재오픈 사유를 입력해주세요." },
                        { status: 400 }
                    );
                }
                // 7일 이내 확인
                if (currentSR.completedAt) {
                    const daysSinceCompletion =
                        (new Date().getTime() - new Date(currentSR.completedAt).getTime()) /
                        (1000 * 60 * 60 * 24);
                    if (daysSinceCompletion > 7) {
                        return NextResponse.json(
                            { error: "완료 후 7일이 지나 재오픈할 수 없습니다." },
                            { status: 400 }
                        );
                    }
                }
                newStatus = "IN_PROGRESS";
                break;

            default:
                return NextResponse.json(
                    { error: "알 수 없는 액션입니다." },
                    { status: 400 }
                );
        }

        // 상태 업데이트
        const result = await srService.updateSR(srId, {
            status: newStatus,
            changeReason: reason || `상태 변경: ${currentStatus} → ${newStatus}`,
            ...(updateData.resolutionDescription &&
                typeof updateData.resolutionDescription === 'string' &&
                { resolutionDescription: updateData.resolutionDescription }),
            ...(updateData.rejectionReason &&
                typeof updateData.rejectionReason === 'string' &&
                { rejectionReason: updateData.rejectionReason }),
        }, session.user);

        return NextResponse.json({
            success: true,
            data: result,
            message: "상태가 변경되었습니다.",
        });
    } catch (error) {
        console.error("SR 상태 변경 오류:", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "상태 변경 중 오류가 발생했습니다.",
            },
            { status: 500 }
        );
    }
}
