'use server';

import { revalidatePath } from 'next/cache';
import type { SR } from '@prisma/client';

import {
  authenticateAndAuthorize,
  getAuthenticatedSession,
  requireRateLimit,
  validateWithSchema,
} from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { ensureCanReadSR } from '@/lib/policies';
import { fail, ok, Result } from '@/lib/result';
import { srCreateSchema, srUpdateSchema } from '@/lib/schemas';
import { srService } from '@/services/sr.service';
import { SRCreateResult, SRDetails, SRUpdateResult } from '@/types/sr.types';

import { buildSRCreateInput, buildSRUpdateInput } from './sr-form.utils';

export async function createSRAction(formData: FormData): Promise<Result<SRCreateResult>> {
  try {
    await requireRateLimit('strict');
    const payload = buildSRCreateInput(formData);
    const validationResult = validateWithSchema(payload, srCreateSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    // SR 등록 권한 체크: SR:CREATE 권한 필요
    const session = await authenticateAndAuthorize(PERMISSIONS.SR.CREATE);

    const sr = await srService.createSR(validated, session.user);

    revalidatePath('/srs');
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

    const sr = await srService.updateSR(id, validated, session.user);

    revalidatePath('/srs');
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

    await srService.deleteSR(id, session.user);

    revalidatePath('/srs');
    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRAction(id: string): Promise<Result<SR>> {
  try {
    const session = await getAuthenticatedSession();
    const sr = await srService.getSRById(id);

    if (!sr) {
      return fail('SR을 찾을 수 없습니다.', 'NOT_FOUND');
    }

    ensureCanReadSR(session.user, sr);

    return ok(sr);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRDetailsAction(id: string): Promise<Result<SRDetails>> {
  try {
    const session = await getAuthenticatedSession();
    const sr = await srService.getSRDetailsById(id);

    if (!sr) {
      return fail('SR을 찾을 수 없습니다.', 'NOT_FOUND');
    }

    ensureCanReadSR(session.user, sr);

    return ok(sr);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRActivitiesAction(
  srId: string,
  options?: { cursor?: string; limit?: number }
): Promise<
  Result<{
    activities: Array<{
      id: string;
      type: string;
      description: string;
      createdAt: Date;
      user: { id: string; name: string; image: string | null };
    }>;
    nextCursor: string | null;
  }>
> {
  try {
    const session = await getAuthenticatedSession();
    const sr = await srService.getSRById(srId);

    if (!sr) {
      return fail('SR을 찾을 수 없습니다.', 'NOT_FOUND');
    }

    ensureCanReadSR(session.user, sr);

    const result = await srService.getSRActivities(srId, options);
    return ok(result);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRCommentsAction(
  srId: string,
  options?: { cursor?: string; limit?: number }
): Promise<
  Result<{
    comments: Array<{
      id: string;
      content: string;
      createdAt: Date;
      updatedAt: Date;
      user: { id: string; name: string; image: string | null };
    }>;
    nextCursor: string | null;
  }>
> {
  try {
    const session = await getAuthenticatedSession();
    const sr = await srService.getSRById(srId);

    if (!sr) {
      return fail('SR을 찾을 수 없습니다.', 'NOT_FOUND');
    }

    ensureCanReadSR(session.user, sr);

    const result = await srService.getSRComments(srId, options);
    return ok(result);
  } catch (error) {
    return errorToResult(error);
  }
}
