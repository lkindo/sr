"use server";

import { z } from "zod";
import { ClientService } from "@/services/client.service";
import { auth } from "@/auth";
import { PermissionService } from "@/services/permission.service";
import { clientCreateSchema, clientUpdateSchema } from "@/lib/schemas";

export async function createClientAction(formData: FormData) {
  try {
    const data = {
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      industry: formData.get("industry") as string | undefined,
      contactPerson: formData.get("contactPerson") as string | undefined,
      contactEmail: formData.get("contactEmail") as string | undefined,
      contactPhone: formData.get("contactPhone") as string | undefined,
      address: formData.get("address") as string | undefined,
      contractStartDate: formData.get("contractStartDate") as string | undefined,
      contractEndDate: formData.get("contractEndDate") as string | undefined,
    };

    const validated = clientCreateSchema.parse(data);

    // 인증 및 권한 확인
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "인증되지 않은 사용자입니다.",
      };
    }

    // 권한 확인
    const permissionService = new PermissionService();
    await permissionService.requirePermission(session.user.id, 'client:create');

    // ClientService 인스턴스 생성
    const clientService = new ClientService();

    // 고객사 생성
    const client = await clientService.createClient(validated);

    return {
      success: true,
      data: client,
      message: "고객사가 성공적으로 생성되었습니다.",
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
      error: error instanceof Error ? error.message : "고객사 생성 중 오류가 발생했습니다.",
    };
  }
}

export async function updateClientAction(id: string, formData: FormData) {
  try {
    const data = {
      name: formData.get("name") as string | undefined,
      industry: formData.get("industry") as string | undefined,
      contactPerson: formData.get("contactPerson") as string | undefined,
      contactEmail: formData.get("contactEmail") as string | undefined,
      contactPhone: formData.get("contactPhone") as string | undefined,
      address: formData.get("address") as string | undefined,
      contractStartDate: formData.get("contractStartDate") as string | undefined,
      contractEndDate: formData.get("contractEndDate") as string | undefined,
    };

    const validated = clientUpdateSchema.parse(data);

    // 인증 및 권한 확인
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "인증되지 않은 사용자입니다.",
      };
    }

    // 권한 확인
    const permissionService = new PermissionService();
    await permissionService.requirePermission(session.user.id, 'client:update');

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
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues?.[0].message || "입력값 검증에 실패했습니다.",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "고객사 업데이트 중 오류가 발생했습니다.",
    };
  }
}

export async function deleteClientAction(id: string) {
  try {
    // 인증 및 권한 확인
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "인증되지 않은 사용자입니다.",
      };
    }

    // 권한 확인
    const permissionService = new PermissionService();
    await permissionService.requirePermission(session.user.id, 'client:delete');

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
    // No auth check needed for a simple selection list
    const clientService = new ClientService();
    const clients = await clientService.getAllClients();
    return { success: true, data: clients };
  } catch (error) {
    return { success: false, error: "고객사 목록을 불러오는데 실패했습니다." };
  }
}
