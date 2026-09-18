'use server';

import { revalidatePath } from 'next/cache';

import {
  authenticateAndAuthorize,
  getAuthenticatedSession,
  requireRateLimit,
  validateWithSchema,
} from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { canRegisterSROnBehalf, ensureCanReadSR } from '@/lib/policies';
import { fail, ok, Result } from '@/lib/result';
import { srCreateSchema, srPatchSchema } from '@/lib/schemas';
import { serializeResponse } from '@/lib/serialization';
import { buildSRCreateInput, buildSRUpdateInput } from '@/lib/sr-form.utils';
import { srService } from '@/services/sr.service';
import { SRCreateResult, SRDetails, SRUpdateResult } from '@/types/sr.types';

export async function createSRAction(formData: FormData): Promise<Result<SRCreateResult>> {
  try {
    // 액션별 네임스페이스를 준다 — 한 액션의 폭주가 나머지를 잠그지 않는다(감사 D-15).
    await requireRateLimit('strict', 'sr-create');
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
    return ok(serializeResponse(sr));
  } catch (error) {
    return errorToResult(error);
  }
}

/**
 * 대리 등록(D3)에서 신청자로 고를 수 있는 고객 목록 — 활성·승인된 이 고객사의 고객 사용자.
 * 서버 검증(createSR)과 같은 조건(policies.eligibleRequesterWhere)이다. 내부 사용자만 부를 수 있다.
 */
export async function getSRRequesterCandidatesAction(
  clientId: string
): Promise<Result<Array<{ id: string; name: string; email: string }>>> {
  try {
    const session = await getAuthenticatedSession();
    if (!canRegisterSROnBehalf(session.user)) {
      return fail('대리 등록 권한이 없습니다.', 'FORBIDDEN');
    }
    return ok(await srService.getRequesterCandidates(clientId));
  } catch (error) {
    return errorToResult(error);
  }
}

export async function updateSRAction(
  id: string,
  formData: FormData
): Promise<Result<SRUpdateResult>> {
  try {
    // REST 트윈(`PATCH /api/srs/[id]`)은 `{ preset: 'strict' }` 로 분당 5회다(감사 4.3).
    // 서버 액션은 유효 세션 + `Next-Action` 헤더만으로 도달 가능한 공개 POST 이므로,
    // 여기에 제한이 없으면 액션 경로로 그 한도를 그대로 우회할 수 있었다.
    // 담당자 변경마다 대상에게 이메일 + 푸시가 발화하므로 무제한 알림 폭주가 가능했다.
    await requireRateLimit('strict', 'sr-update');

    const processedData = buildSRUpdateInput(formData);
    const validationResult = validateWithSchema(processedData, srPatchSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    // SR 수정 권한 체크는 서비스 레이어에서 처리
    const session = await getAuthenticatedSession();

    const sr = await srService.updateSR(id, validated, session.user);

    revalidatePath('/srs');
    revalidatePath(`/srs/${id}`);
    return ok(serializeResponse(sr));
  } catch (error) {
    return errorToResult(error);
  }
}

export async function deleteSRAction(id: string): Promise<Result<void>> {
  try {
    // REST 트윈과 동일하게 strict. 삭제는 되돌릴 수 없으므로 더욱 그렇다(감사 4.3).
    await requireRateLimit('strict', 'sr-delete');

    // SR 삭제 권한 체크는 서비스 레이어에서 처리
    const session = await getAuthenticatedSession();

    await srService.deleteSR(id, session.user);

    revalidatePath('/srs');
    return ok(undefined);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getSRDetailsAction(id: string): Promise<Result<SRDetails>> {
  try {
    const session = await getAuthenticatedSession();
    const sr = await srService.getSRDetailsById(id, { viewer: session.user });

    if (!sr) {
      return fail('SR을 찾을 수 없습니다.', 'NOT_FOUND');
    }

    ensureCanReadSR(session.user, sr);

    return ok(serializeResponse(sr));
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
      metadata?: unknown;
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

    const result = await srService.getSRActivities(srId, session.user, options);
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
      /** 내부 노트(고객에게 보이지 않음). 외부 사용자에게는 visibleCommentsWhere 가 애초에 싣지 않는다. */
      isInternal: boolean;
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

    const result = await srService.getSRComments(srId, session.user, options);
    return ok(result);
  } catch (error) {
    return errorToResult(error);
  }
}
