"use server";

import { z } from "zod";
import { SRService } from "@/services/sr.service";
import { auth } from "@/auth";
import { PermissionService } from "@/services/permission.service"; // Import PermissionService
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas";

const permissionService = new PermissionService(); // Instantiate PermissionService once

export async function createSRAction(formData: FormData) {
  try {
    const data = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      clientId: formData.get("clientId") as string,
      serviceCategoryId: formData.get("serviceCategoryId") as string,
      requestedPriority: formData.get("requestedPriority") as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      requestedCompletionDate: formData.get("requestedCompletionDate") as string | undefined,
    };

    const validated = srCreateSchema.parse(data);

    // 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "인증되지 않은 사용자입니다.",
      };
    }
    await permissionService.requirePermission(session.user.id, 'sr:create'); // Permission check

    // SRService 인스턴스 생성
    const srService = new SRService();

    // SR 생성
    const sr = await srService.createSR(validated, session.user);

    return {
      success: true,
      data: sr,
      message: "SR이 성공적으로 생성되었습니다.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0].message || "입력값 검증에 실패했습니다.",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "SR 생성 중 오류가 발생했습니다.",
    };
  }
}

export async function updateSRAction(id: string, formData: FormData) {
  try {
    const data = {
      title: formData.get("title") as string | undefined,
      description: formData.get("description") as string | undefined,
      serviceCategoryId: formData.get("serviceCategoryId") as string | undefined,
      priority: formData.get("priority") as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined,
      status: formData.get("status") as 
        | "REQUESTED"
        | "INTAKE" 
        | "IN_PROGRESS"
        | "ON_HOLD"
        | "COMPLETED"
        | "CONFIRMED"
        | "REJECTED" 
        | undefined,
      assignedToId: formData.get("assignedToId") as string | null | undefined,
      expectedCompletionDate: formData.get("expectedCompletionDate") as string | null | undefined,
      dueDate: formData.get("dueDate") as string | null | undefined,
      actualCompletionDate: formData.get("actualCompletionDate") as string | null | undefined,
      resolutionDescription: formData.get("resolutionDescription") as string | null | undefined,
      rejectionReason: formData.get("rejectionReason") as string | null | undefined,
      satisfactionRating: formData.get("satisfactionRating") as string | undefined,
      additionalFeedback: formData.get("additionalFeedback") as string | undefined,
      // 접수 처리 관련 필드
      actualPriority: formData.get("actualPriority") as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined,
      estimatedHours: formData.get("estimatedHours") as string | undefined,
      estimatedCompletionDate: formData.get("estimatedCompletionDate") as string | undefined,
      intakeNotes: formData.get("intakeNotes") as string | undefined,
      assigneeId: formData.get("assigneeId") as string | undefined,
      changeReason: formData.get("changeReason") as string | undefined,
    };

    // 빈 문자열을 null로 변환
    const processedData: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === "") {
        processedData[key] = null;
      } else if (key === "satisfactionRating" && value !== undefined) {
        const rating = parseInt(value as string, 10);
        processedData[key] = isNaN(rating) ? null : rating;
      } else {
        processedData[key] = value;
      }
    }

    const validated = srUpdateSchema.parse(processedData);

    // 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "인증되지 않은 사용자입니다.",
      };
    }
    await permissionService.requirePermission(session.user.id, 'sr:update'); // Permission check

    // SRService 인스턴스 생성
    const srService = new SRService();

    // 필요한 사용자 정보만 추출
    const userForService = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      roles: session.user.roles || [],
      permissions: session.user.permissions || [],
    };

    // SR 업데이트
    const sr = await srService.updateSR(id, validated, userForService as any);

    return {
      success: true,
      data: sr,
      message: "SR이 성공적으로 업데이트되었습니다.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0].message || "입력값 검증에 실패했습니다.",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "SR 업데이트 중 오류가 발생했습니다.",
    };
  }
}

export async function deleteSRAction(id: string) {
  try {
    // 인증 확인
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "인증되지 않은 사용자입니다.",
      };
    }
    await permissionService.requirePermission(session.user.id, 'sr:delete'); // Permission check

    // SRService 인스턴스 생성
    const srService = new SRService();

    // SR 삭제
    await srService.deleteSR(id);

    return {
      success: true,
      message: "SR이 성공적으로 삭제되었습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "SR 삭제 중 오류가 발생했습니다.",
    };
  }
}

export async function getSRAction(id: string) {
  try {
    // 인증 확인은 필요에 따라 처리 가능

    // SRService 인스턴스 생성
    const srService = new SRService();

    // SR 조회
    const sr = await srService.getSRById(id);

    if (!sr) {
      return {
        success: false,
        error: "SR을 찾을 수 없습니다.",
      };
    }

    return {
      success: true,
      data: sr,
    };
  } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "SR 조회 중 오류가 발생했습니다.",
        };
      }
    }
    
    export async function getSRDetailsAction(id: string) {
      try {
        const srService = new SRService();
        const sr = await srService.getSRById(id);
    
        if (!sr) {
          return { success: false, error: "SR을 찾을 수 없습니다." };
        }
    
        return { success: true, data: sr };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "SR 상세 정보 조회 중 오류가 발생했습니다.",
        };
      }
    }
    