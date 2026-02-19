'use server';

import {
  authenticateAndAuthorize,
  getAuthenticatedSession,
  validateWithSchema,
} from '@/lib/action-helpers';
import { errorToResult } from '@/lib/errors';
import { getFormDataValue } from '@/lib/form-data-parser';
import { logger } from '@/lib/logger';
import { hasPermissionFlag, PERMISSIONS } from '@/lib/permission-helpers';
import { ensureCanReadClient } from '@/lib/policies';
import { fail, ok, Result } from '@/lib/result';
import { clientCreateSchema, clientUpdateSchema } from '@/lib/schemas';
import { ClientService } from '@/services/client.service';

type ClientCreateResult = Awaited<ReturnType<ClientService['createClient']>>;

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
    const clientService = new ClientService();

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
    await authenticateAndAuthorize('client:update');

    // ClientService 인스턴스 생성
    const clientService = new ClientService();

    // 고객사 업데이트
    const client = await clientService.updateClient(id, validated);

    return {
      success: true,
      data: client,
      message: '고객사가 성공적으로 업데이트되었습니다.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '고객사 업데이트 중 오류가 발생했습니다.',
    };
  }
}

export async function deleteClientAction(id: string) {
  try {
    // 인증 및 권한 확인
    await authenticateAndAuthorize('client:delete');

    // ClientService 인스턴스 생성
    const clientService = new ClientService();

    // 고객사 삭제
    await clientService.deleteClient(id);

    return {
      success: true,
      message: '고객사가 성공적으로 삭제되었습니다.',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '고객사 삭제 중 오류가 발생했습니다.',
    };
  }
}

export async function getClientAction(id: string): Promise<Result<any>> {
  try {
    const session = await getAuthenticatedSession();

    // ClientService 인스턴스 생성
    const clientService = new ClientService();

    // 고객사 조회
    const client = await clientService.getClientById(id);

    // 권한 확인: 관리자 권한(CLIENT:READ)이 있거나, 본인의 고객사 ID여야 함
    // ensureCanReadClient 내부에서 ADMIN 여부 및 CLIENT:READ 권한, 소속 고객사 여부 통합 확인
    ensureCanReadClient(session.user, client || undefined);

    if (!client) {
      return fail('고객사를 찾을 수 없습니다.', 'NOT_FOUND');
    }

    return ok(client);
  } catch (error) {
    return errorToResult(error);
  }
}

export async function getClientsForSelection() {
  try {
    logger.debug('🔍 [getClientsForSelection] 고객사 목록 조회 시작');

    // 인증 및 권한 확인 (고객사 조회 권한 필요)
    await authenticateAndAuthorize(PERMISSIONS.CLIENT.READ);

    const clientService = new ClientService();
    // 필요한 정보만 선택적으로 조회 (보안 강화)
    const clients = await clientService.getClientsForSelection();

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
