"use server";

import { z } from "zod";
import { SRService } from "@/services/sr.service";
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas";
import { Result, ok, fail } from "@/lib/result";
import { errorToResult } from "@/lib/errors";
import { getFormDataValue } from "@/lib/form-data-parser";
import { authenticateAndAuthorize, validateWithSchema, getAuthenticatedSession } from "@/lib/action-helpers";
import type { SR } from "@prisma/client";

export async function createSRAction(
  formData: FormData
): Promise<Result<SR & {
  client: { id: string; code: string; name: string };
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  serviceCategory: { id: string; categoryName: string };
}>> {
  try {
    const data = {
      title: getFormDataValue(formData, "title") || "",
      description: getFormDataValue(formData, "description") || "",
      clientId: getFormDataValue(formData, "clientId") || "",
      serviceCategoryId: getFormDataValue(formData, "serviceCategoryId") || "",
      requestedPriority: (getFormDataValue(formData, "requestedPriority") || "MEDIUM") as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      requestedCompletionDate: getFormDataValue(formData, "requestedCompletionDate") || undefined,
    };

    const validationResult = validateWithSchema(data, srCreateSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    // SR 등록 권한 체크: SR:CREATE 권한 필요
    const session = await authenticateAndAuthorize('SR:CREATE');

    const srService = new SRService();
    const sr = await srService.createSR(validated, session.user);

    return ok(sr);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function updateSRAction(
  id: string,
  formData: FormData
): Promise<Result<SR & {
  client?: { id: string; code: string; name: string };
  requester?: { id: string; name: string; email: string };
  assignee?: { id: string; name: string; email: string } | null;
  serviceCategory?: { id: string; categoryName: string };
}>> {
  try {
    const data = {
      title: getFormDataValue(formData, "title") || undefined,
      description: getFormDataValue(formData, "description") || undefined,
      serviceCategoryId: getFormDataValue(formData, "serviceCategoryId") || undefined,
      priority: (getFormDataValue(formData, "priority") || undefined) as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined,
      status: (getFormDataValue(formData, "status") || undefined) as
        | "REQUESTED"
        | "INTAKE"
        | "IN_PROGRESS"
        | "ON_HOLD"
        | "COMPLETED"
        | "CONFIRMED"
        | "REJECTED"
        | undefined,
      assignedToId: getFormDataValue(formData, "assignedToId"),
      expectedCompletionDate: getFormDataValue(formData, "expectedCompletionDate"),
      dueDate: getFormDataValue(formData, "dueDate"),
      actualCompletionDate: getFormDataValue(formData, "actualCompletionDate"),
      resolutionDescription: getFormDataValue(formData, "resolutionDescription"),
      rejectionReason: getFormDataValue(formData, "rejectionReason"),
      satisfactionRating: getFormDataValue(formData, "satisfactionRating") || undefined,
      additionalFeedback: getFormDataValue(formData, "additionalFeedback") || undefined,
      actualPriority: (getFormDataValue(formData, "actualPriority") || undefined) as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined,
      estimatedHours: getFormDataValue(formData, "estimatedHours") || undefined,
      estimatedCompletionDate: getFormDataValue(formData, "estimatedCompletionDate") || undefined,
      intakeNotes: getFormDataValue(formData, "intakeNotes") || undefined,
      assigneeId: getFormDataValue(formData, "assigneeId") || undefined,
      changeReason: getFormDataValue(formData, "changeReason") || undefined,
    };

    // 빈 문자열을 null 또는 undefined로 변환
    const processedData: Record<string, string | number | null | undefined> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === "") {
        // enum 필드(priority, status, actualPriority)는 undefined로 처리
        if (key === "priority" || key === "status" || key === "actualPriority") {
          processedData[key] = undefined;
        } else {
          processedData[key] = null;
        }
      } else if (key === "satisfactionRating" && value !== undefined) {
        const rating = parseInt(value as string, 10);
        processedData[key] = isNaN(rating) ? null : rating;
      } else if (key === "estimatedHours" && value !== undefined && value !== "") {
        const hours = parseFloat(value as string);
        processedData[key] = isNaN(hours) ? undefined : hours;
      } else {
        processedData[key] = value;
      }
    }

    const validationResult = validateWithSchema(processedData, srUpdateSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    // SR 수정 권한 체크는 서비스 레이어에서 처리
    const session = await getAuthenticatedSession();

    const srService = new SRService();
    const sr = await srService.updateSR(id, validated, session.user);

    return ok(sr);
  } catch (error) {
    console.error("SR 수정 오류:", error);
    return errorToResult(error);
  }
}

export async function deleteSRAction(id: string): Promise<Result<void>> {
  try {
    // SR 삭제 권한 체크는 서비스 레이어에서 처리
    const session = await getAuthenticatedSession();

    const srService = new SRService();
    await srService.deleteSR(id, session.user);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRAction(id: string): Promise<Result<SR>> {
  try {
    const srService = new SRService();
    const sr = await srService.getSRById(id);

    if (!sr) {
      return fail("SR을 찾을 수 없습니다.", "NOT_FOUND");
    }

    return ok(sr);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRDetailsAction(id: string): Promise<Result<SR & {
  client: { id: string; code: string; name: string };
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  intakeBy: { id: string; name: string; email: string; image: string | null } | null;
  serviceCategory: { id: string; categoryName: string };
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; name: string; email: string };
  }>;
  activities: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: Date;
    user: { id: string; name: string; email: string };
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    fileUrl: string;
    createdAt: Date;
  }>;
  statusHistory: Array<{
    id: string;
    currentStatus: string;
    previousStatus: string | null;
    changedAt: Date;
    user: { id: string; name: string; image: string | null };
  }>;
  _count: { comments: number; attachments: number };
}>> {
  try {
    const srService = new SRService();
    const sr = await srService.getSRDetailsById(id);

    if (!sr) {
      return fail("SR을 찾을 수 없습니다.", "NOT_FOUND");
    }

    return ok(sr);
  } catch (error) {
    return errorToResult(error);
  }
}
    