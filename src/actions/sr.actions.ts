"use server";

import { z } from "zod";
import { SRService } from "@/services/sr.service";
import { auth } from "@/auth";
import { PermissionService } from "@/services/permission.service";
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas";
import { Result, ok, fail } from "@/lib/result";
import { errorToResult, UnauthorizedError } from "@/lib/errors";

const permissionService = new PermissionService();

export async function createSRAction(formData: FormData): Promise<Result<any>> {
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

    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'sr:create');

    const srService = new SRService();
    const sr = await srService.createSR(validated, session.user);

    return ok(sr);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues?.[0].message || "입력값 검증에 실패했습니다.", "VALIDATION_ERROR");
    }
    return errorToResult(error);
  }
}

export async function updateSRAction(id: string, formData: FormData): Promise<Result<any>> {
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
      actualPriority: formData.get("actualPriority") as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined,
      estimatedHours: formData.get("estimatedHours") as string | undefined,
      estimatedCompletionDate: formData.get("estimatedCompletionDate") as string | undefined,
      intakeNotes: formData.get("intakeNotes") as string | undefined,
      assigneeId: formData.get("assigneeId") as string | undefined,
      changeReason: formData.get("changeReason") as string | undefined,
    };

    // 빈 문자열을 null로 변환
    const processedData: Record<string, string | number | null | undefined> = {};
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

    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'sr:update');

    const srService = new SRService();
    const userForService = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      roles: session.user.roles || [],
      permissions: session.user.permissions || [],
    };

    const sr = await srService.updateSR(id, validated, userForService as any);

    return ok(sr);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues?.[0].message || "입력값 검증에 실패했습니다.", "VALIDATION_ERROR");
    }
    return errorToResult(error);
  }
}

export async function deleteSRAction(id: string): Promise<Result<void>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }
    await permissionService.requirePermission(session.user.id, 'sr:delete');

    const srService = new SRService();
    await srService.deleteSR(id);

    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRAction(id: string): Promise<Result<any>> {
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

export async function getSRDetailsAction(id: string): Promise<Result<any>> {
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
    