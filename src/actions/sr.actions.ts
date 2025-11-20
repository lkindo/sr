"use server";

import { z } from "zod";
import { SRService } from "@/services/sr.service";
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas";
import { Result, ok, fail } from "@/lib/result";
import { errorToResult } from "@/lib/errors";
import { authenticateAndAuthorize, validateWithSchema, getAuthenticatedSession } from "@/lib/action-helpers";
import { PERMISSIONS } from "@/lib/permission-helpers";
import type { SR } from "@prisma/client";
import { buildSRCreateInput, buildSRUpdateInput } from "./sr-form.utils";

export async function createSRAction(
  formData: FormData
): Promise<Result<SR & {
  client: { id: string; code: string; name: string };
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string; email: string } | null;
  serviceCategory: { id: string; categoryName: string };
}>> {
  try {
    const payload = buildSRCreateInput(formData);
    const validationResult = validateWithSchema(payload, srCreateSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    // SR 등록 권한 체크: SR:CREATE 권한 필요
    const session = await authenticateAndAuthorize(PERMISSIONS.SR.CREATE);

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
    const processedData = buildSRUpdateInput(formData);
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
    user: { id: string; name: string; image: string | null };
  }>;
  activities: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: Date;
    user: { id: string; name: string; image: string | null };
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
