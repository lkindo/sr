import { z } from "zod";
import { UserService } from "./user.service";
import { clientCreateSchema, clientUpdateSchema } from "@/lib/schemas";
import { NotFoundError, DuplicateError, ReferentialIntegrityError } from "@/lib/errors";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type ClientCreateData = z.infer<typeof clientCreateSchema>;
type ClientUpdateData = z.infer<typeof clientUpdateSchema>;

/**
 * 고객사 서비스
 *
 * 고객사 관리 및 관련 비즈니스 로직을 처리합니다.
 * - 고객사 CRUD
 * - 고객사-사용자 연결 관리
 * - 서비스 카테고리 연동
 * - 고객사 담당자(Handler) 관리
 */
export class ClientService {
  constructor(
    private userService: UserService = new UserService()
  ) { }

  /**
   * 고객사 ID로 조회
   *
   * @param id - 고객사 ID
   * @returns 고객사 정보 또는 null
   */
  async getClientById(id: string) {
    return prisma.client.findUnique({ where: { id } });
  }

  async getClientDetailsById(id: string) {
    return prisma.client.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: true,
          },
        },
        srs: true,
        serviceCategories: true,
        clientHandlers: {
          include: {
            user: true,
            backupHandler: true,
          },
        },
      },
    });
  }

  async getClientByCode(code: string) {
    return prisma.client.findUnique({
      where: { code },
    });
  }

  async getClientByName(name: string) {
    return prisma.client.findFirst({
      where: { name: { contains: name, mode: 'insensitive' } },
    });
  }

  async getAllClients() {
    return prisma.client.findMany();
  }

  /**
   * 고객사를 생성합니다.
   *
   * 프로세스:
   * 1. 고객사 코드 중복 확인
   * 2. 고객사 생성
   *
   * @param data - 고객사 생성 데이터
   * @param data.code - 고객사 코드 (고유값, 2자 이상)
   * @param data.name - 고객사명 (1자 이상)
   * @param data.industry - 산업 분류 (선택)
   * @param data.contactPerson - 담당자 (선택)
   * @param data.contactEmail - 담당자 이메일 (선택)
   * @param data.contactPhone - 담당자 연락처 (선택)
   * @param data.address - 주소 (선택)
   * @param data.contractStartDate - 계약 시작일 (선택)
   * @param data.contractEndDate - 계약 종료일 (선택)
   *
   * @returns 생성된 고객사
   *
   * @throws {ValidationError} 입력 데이터 검증 실패
   * @throws {DuplicateError} 고객사 코드 중복
   *
   * @example
   * ```typescript
   * const client = await clientService.createClient({
   *   code: 'ABC',
   *   name: 'ABC 주식회사',
   *   industry: 'IT',
   *   contactEmail: 'contact@abc.com',
   * });
   * ```
   */
  async createClient(data: ClientCreateData) {
    const validated = clientCreateSchema.parse(data);

    // 코드 중복 확인
    const existingClient = await this.getClientByCode(validated.code);
    if (existingClient) {
      throw new DuplicateError("고객사 코드", "code", validated.code);
    }

    return prisma.client.create({
      data: {
        code: validated.code,
        name: validated.name,
        industry: validated.industry,
        contactPerson: validated.contactPerson,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone,
        address: validated.address,
        contractStartDate: validated.contractStartDate ? new Date(validated.contractStartDate) : null,
        contractEndDate: validated.contractEndDate ? new Date(validated.contractEndDate) : null,
        isActive: true,
      }
    });
  }

  async updateClient(id: string, data: ClientUpdateData) {
    const validated = clientUpdateSchema.parse(data);

    // 기존 고객사 정보 확인
    const existingClient = await prisma.client.findUnique({ where: { id } });
    if (!existingClient) {
      throw new NotFoundError("고객사", id);
    }

    return prisma.client.update({
      where: { id },
      data: {
        name: validated.name,
        industry: validated.industry,
        contactPerson: validated.contactPerson,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone,
        address: validated.address,
        contractStartDate: validated.contractStartDate ? new Date(validated.contractStartDate) : null,
        contractEndDate: validated.contractEndDate ? new Date(validated.contractEndDate) : null,
      }
    });
  }

  async deleteClient(id: string) {
    // 고객사 삭제 전 관련 데이터 확인
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundError("고객사", id);
    }

    // 참조 무결성 확인: 관련된 데이터가 있는지 체크
    const [srsCount, usersCount, serviceCategoriesCount, clientHandlersCount] = await Promise.all([
      prisma.sR.count({ where: { clientId: id } }),
      prisma.userClient.count({ where: { clientId: id } }),
      prisma.serviceCategory.count({ where: { clientId: id } }),
      prisma.clientHandler.count({ where: { clientId: id } }),
    ]);

    const hasRelatedData = srsCount > 0 || usersCount > 0 || serviceCategoriesCount > 0 || clientHandlersCount > 0;

    if (hasRelatedData) {
      const errorMessages: string[] = [];
      if (srsCount > 0) errorMessages.push(`${srsCount}개의 SR`);
      if (usersCount > 0) errorMessages.push(`${usersCount}개의 사용자 연결`);
      if (serviceCategoriesCount > 0) errorMessages.push(`${serviceCategoriesCount}개의 서비스 카테고리`);
      if (clientHandlersCount > 0) errorMessages.push(`${clientHandlersCount}개의 담당자 연결`);

      throw new ReferentialIntegrityError(
        `고객사를 삭제할 수 없습니다. 다음 관련 데이터가 존재합니다: ${errorMessages.join(', ')}. ` +
        `먼저 관련 데이터를 삭제하거나 고객사를 비활성화하세요.`
      );
    }

    // 관련 데이터가 없으면 삭제 진행
    return prisma.client.delete({ where: { id } });
  }

  async activateClient(clientId: string) {
    return prisma.client.update({ where: { id: clientId }, data: { isActive: true } });
  }

  async deactivateClient(clientId: string) {
    return prisma.client.update({ where: { id: clientId }, data: { isActive: false } });
  }

  async getClientsByUserId(userId: string) {
    return prisma.client.findMany({
      where: {
        users: { some: { userId } },
      },
    });
  }

  async getClientWithDetailsAndCategories(id: string) {
    const client = await this.getClientDetailsById(id);
    if (!client) {
      return null;
    }

    // 모든 활성화된 서비스 카테고리 조회
    const serviceCategories = await prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: { categoryName: "asc" },
    });

    // ADMIN 역할을 가진 사용자 제외
    const filteredUsers = (client as any).users?.filter((userClient: any) => {
      const hasAdminRole = userClient.user?.roles?.some(
        (userRole: any) => userRole.role?.name === "ADMIN"
      );
      return !hasAdminRole;
    }) || [];

    return {
      ...client,
      users: filteredUsers,
      serviceCategories,
    };
  }
}