"use server";

import { z } from "zod";
import { ClientService } from "@/services/client.service";
import { clientCreateSchema, clientUpdateSchema } from "@/lib/schemas";
import { Result, ok } from "@/lib/result";
import { errorToResult } from "@/lib/errors";
import { getFormDataValue } from "@/lib/form-data-parser";
import { authenticateAndAuthorize, validateWithSchema } from "@/lib/action-helpers";
import type { Client } from "@prisma/client";

type ClientCreateResult = Awaited<ReturnType<ClientService['createClient']>>;

export async function createClientAction(formData: FormData): Promise<Result<ClientCreateResult>> {
  try {
    const data = {
      code: getFormDataValue(formData, "code") || "",
      name: getFormDataValue(formData, "name") || "",
      industry: getFormDataValue(formData, "industry") || undefined,
      contactPerson: getFormDataValue(formData, "contactPerson") || undefined,
      contactEmail: getFormDataValue(formData, "contactEmail") || undefined,
      contactPhone: getFormDataValue(formData, "contactPhone") || undefined,
      address: getFormDataValue(formData, "address") || undefined,
      contractStartDate: getFormDataValue(formData, "contractStartDate") || undefined,
      contractEndDate: getFormDataValue(formData, "contractEndDate") || undefined,
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
      name: getFormDataValue(formData, "name") || undefined,
      industry: getFormDataValue(formData, "industry") || undefined,
      contactPerson: getFormDataValue(formData, "contactPerson") || undefined,
      contactEmail: getFormDataValue(formData, "contactEmail") || undefined,
      contactPhone: getFormDataValue(formData, "contactPhone") || undefined,
      address: getFormDataValue(formData, "address") || undefined,
      contractStartDate: getFormDataValue(formData, "contractStartDate") || undefined,
      contractEndDate: getFormDataValue(formData, "contractEndDate") || undefined,
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
      message: "고객사가 성공적으로 업데이트되었습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "고객사 업데이트 중 오류가 발생했습니다.",
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
      message: "고객사가 성공적으로 삭제되었습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "고객사 삭제 중 오류가 발생했습니다.",
    };
  }
}

export async function getClientAction(id: string) {
  try {
    // 인증 확인은 필요에 따라 처리 가능

    // ClientService 인스턴스 생성
    const clientService = new ClientService();

    // 고객사 조회
    const client = await clientService.getClientById(id);

    if (!client) {
      return {
        success: false,
        error: "고객사를 찾을 수 없습니다.",
      };
    }

    return {
      success: true,
      data: client,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "고객사 정보 조회 중 오류가 발생했습니다.",
    };
  }
}

export async function getClientsForSelection() {
  try {
    console.log("🔍 [getClientsForSelection] 고객사 목록 조회 시작");

    // No auth check needed for a simple selection list
    const clientService = new ClientService();
    const clients = await clientService.getAllClients();

    console.log("✅ [getClientsForSelection] 고객사 조회 성공:", {
      count: clients.length,
      firstClient: clients[0] ? { id: clients[0].id, name: clients[0].name } : null,
    });

    return { success: true, data: clients };
  } catch (error) {
    console.error("❌ [getClientsForSelection] 고객사 목록 조회 실패:", error);
    console.error("❌ [getClientsForSelection] 에러 상세:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "고객사 목록을 불러오는데 실패했습니다."
    };
  }
}
