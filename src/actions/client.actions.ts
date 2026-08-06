'use server';

import {
  authenticateAndAuthorize,
  getAuthenticatedSession,
  validateWithSchema,
} from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { getFormDataValue } from '@/lib/form-data-parser';
import { logger } from '@/lib/logger';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { ensureCanReadClient, ensureCanWriteClient, isInternalUser } from '@/lib/policies';
import { fail, ok, Result } from '@/lib/result';
import { clientCreateSchema, clientUpdateSchema } from '@/lib/schemas';
import type { ClientService } from '@/services/client.service';
import { services } from '@/services/service-registry';

type ClientCreateResult = Awaited<ReturnType<ClientService['createClient']>>;
type ClientGetResult = Awaited<ReturnType<ClientService['getClientById']>>;

export async function createClientAction(formData: FormData): Promise<Result<ClientCreateResult>> {
  try {
    const data = {
      code: getFormDataValue(formData, 'code') || '',
      name: getFormDataValue(formData, 'name') || '',
      industry: getFormDataValue(formData, 'industry') || undefined,
      contactPerson: getFormDataValue(formData, 'contactPerson') || undefined,
      contactEmail: getFormDataValue(formData, 'contactEmail') || undefined,
      contactPhone: getFormDataValue(formData, 'contactPhone') || undefined,
      address: getFormDataValue(formData, 'address') || undefined,
      contractStartDate: getFormDataValue(formData, 'contractStartDate') || undefined,
      contractEndDate: getFormDataValue(formData, 'contractEndDate') || undefined,
    };

    const validationResult = validateWithSchema(data, clientCreateSchema);
    if (!validationResult.success) {
      return validationResult;
    }
    const validated = validationResult.data;

    // 인증 및 권한 확인
    await authenticateAndAuthorize('client:create');

    // ClientService 인스턴스 생성
    const clientService = services.clientService;

    // 고객사 생성
    const client = await clientService.createClient(validated);

    return ok(client);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function updateClientAction(id: string, formData: FormData) {
  try {
    const data = {
      name: getFormDataValue(formData, 'name') || undefined,
      industry: getFormDataValue(formData, 'industry') || undefined,
      contactPerson: getFormDataValue(formData, 'contactPerson') || undefined,
      contactEmail: getFormDataValue(formData, 'contactEmail') || undefined,
      contactPhone: getFormDataValue(formData, 'contactPhone') || undefined,
      address: getFormDataValue(formData, 'address') || undefined,
      contractStartDate: getFormDataValue(formData, 'contractStartDate') || undefined,
      contractEndDate: getFormDataValue(formData, 'contractEndDate') || undefined,
    };

    const validationResult = validateWithSchema(data, clientUpdateSchema);
    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error,
      };
    }
    const validated = validationResult.data;

    // 인증 및 권한 확인
    const session = await authenticateAndAuthorize('client:update');

    // 테넌트 경계 — REST 트윈(PATCH /api/clients/[id])에는 있었지만 이 액션에는 없었다.
    // 권한 플래그만으로 남의 고객사를 수정할 수 있었다(감사 4.1).
    ensureCanWriteClient(session.user, id);

    // ClientService 인스턴스 생성
    const clientService = services.clientService;

    // 고객사 업데이트
    const client = await clientService.updateClient(id, validated);

    return {
      success: true,
      data: client,
      message: '고객사가 성공적으로 업데이트되었습니다.',
    };
  } catch (error) {
    return errorToResult(error);
  }
}

export async function deleteClientAction(id: string) {
  try {
    // 인증 및 권한 확인
    const session = await authenticateAndAuthorize('client:delete');

    // 테넌트 경계. 삭제는 되돌릴 수 없으므로 수정보다 느슨하면 안 된다(감사 4.1).
    ensureCanWriteClient(session.user, id);

    // ClientService 인스턴스 생성
    const clientService = services.clientService;

    // 고객사 삭제
    await clientService.deleteClient(id);

    return {
      success: true,
      message: '고객사가 성공적으로 삭제되었습니다.',
    };
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getClientsForSelection() {
  try {
    logger.debug('🔍 [getClientsForSelection] 고객사 목록 조회 시작');

    // 인증 및 권한 확인 (고객사 조회 권한 필요)
    const session = await authenticateAndAuthorize(PERMISSIONS.CLIENT.READ);

    const clientService = services.clientService;

    // 내부 사용자인지 확인하여 필터링 적용
    const isInternal = isInternalUser(session.user);
    const clientIds = isInternal ? undefined : session.user.clientIds || [];

    // 필요한 정보만 선택적으로 조회 (보안 강화)
    const clients = await clientService.getClientsForSelection(clientIds);

    logger.debug('✅ [getClientsForSelection] 고객사 조회 성공:', {
      count: clients.length,
      firstClient: clients[0] ? { id: clients[0].id, name: clients[0].name } : null,
    });

    return { success: true, data: clients };
  } catch (error) {
    logger.error('❌ [getClientsForSelection] 고객사 목록 조회 실패:', error as Error);

    return {
      success: false,
      error: error instanceof Error ? error.message : '고객사 목록을 불러오는데 실패했습니다.',
    };
  }
}
