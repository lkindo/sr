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
import { SRCreateResult, SRUpdateResult, SRDetails } from "@/types/sr.types";

import { revalidatePath } from "next/cache";

export async function createSRAction(
  formData: FormData
): Promise<Result<SRCreateResult>> {
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

    revalidatePath("/srs");
    return ok(sr);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function updateSRAction(
  id: string,
  formData: FormData
): Promise<Result<SRUpdateResult>> {
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

    revalidatePath("/srs");
    revalidatePath(`/srs/${id}`);
    return ok(sr);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function deleteSRAction(id: string): Promise<Result<void>> {
  try {
    // SR 삭제 권한 체크는 서비스 레이어에서 처리
    const session = await getAuthenticatedSession();

    const srService = new SRService();
    await srService.deleteSR(id, session.user);

    revalidatePath("/srs");
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

export async function getSRDetailsAction(id: string): Promise<Result<SRDetails>> {
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

export async function getSRActivitiesAction(
  srId: string,
  options?: { cursor?: string; limit?: number }
): Promise<Result<{
  activities: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: Date;
    user: { id: string; name: string; image: string | null };
  }>;
  nextCursor: string | null;
}>> {
  try {
    const prisma = (await import("@/lib/prisma")).default;

    const limit = options?.limit || 20;
    const cursor = options?.cursor;

    const activities = await prisma.sRActivity.findMany({
      where: { srId },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    const hasMore = activities.length > limit;
    const items = hasMore ? activities.slice(0, limit) : activities;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return ok({ activities: items, nextCursor });
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRCommentsAction(
  srId: string,
  options?: { cursor?: string; limit?: number }
): Promise<Result<{
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; name: string; image: string | null };
  }>;
  nextCursor: string | null;
}>> {
  try {
    const prisma = (await import("@/lib/prisma")).default;

    const limit = options?.limit || 20;
    const cursor = options?.cursor;

    const comments = await prisma.sRComment.findMany({
      where: { srId },
      take: limit + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return ok({ comments: items, nextCursor });
  } catch (error) {
    return errorToResult(error);
  }
}
