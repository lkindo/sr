import { z } from 'zod';

import { DuplicateError, NotFoundError, ReferentialIntegrityError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { clientCreateSchema, clientUpdateSchema } from '@/lib/schemas';

import { serviceCategoryService } from './service-category.service';
import { UserService } from './user.service';

type ClientCreateData = z.infer<typeof clientCreateSchema>;
type ClientUpdateData = z.infer<typeof clientUpdateSchema>;

/**
 * 신규 고객사에 자동 생성되는 기본 서비스 카테고리.
 *
 * SR 의 serviceCategoryId 는 필수라, 카테고리가 하나도 없으면 그 고객사는 SR 을
 * 접수할 수 없다. 온보딩 직후 막다른 길이 되지 않도록 최소 한 개를 보장한다(감사 3.18).
 */
const DEFAULT_SERVICE_CATEGORY = {
  categoryName: '일반 요청',
  description: '분류되지 않은 일반 서비스 요청',
  slaHours: 24,
  priority: 'MEDIUM',
} as const;

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
  constructor(private userService: UserService = new UserService()) {}

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
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                emailVerified: true,
                roles: {
                  include: {
                    role: true,
                  },
                },
              },
            },
          },
        },
        // 테넌트 노출 최소화: 고객사 상세 응답에 전체 SR 본문(설명/처리결과/반려사유)이
        // 실려나가지 않도록 상세 화면에 필요한 최근 SR 요약만 제한적으로 조회한다.
        srs: {
          select: {
            id: true,
            srNumber: true,
            title: true,
            status: true,
            priority: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        // 통계/삭제 가능 여부 판정을 위한 실제 전체 건수
        _count: {
          select: {
            srs: true,
            users: true,
          },
        },
        serviceCategories: true,
        clientHandlers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                isActive: true,
              },
            },
            backupHandler: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                isActive: true,
              },
            },
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

  async getClientsForSelection(clientIds?: string[]) {
    // If clientIds are provided, restrict the query to those IDs
    const where = clientIds ? { id: { in: clientIds } } : {};

    return prisma.client.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
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
      throw new DuplicateError('고객사 코드', 'code', validated.code);
    }

    // 기본 서비스 카테고리를 같은 트랜잭션에서 함께 만든다.
    //
    // SR 은 serviceCategoryId 가 필수(스키마 non-nullable)라, 카테고리가 0개인 고객사는
    // **구조적으로 SR 을 한 건도 받을 수 없다**. 서류상 온보딩은 끝났는데 실제로는
    // 막다른 길이 되는 상태였다(감사 3.18). 안전망으로 기본 카테고리 하나를 시드한다.
    // 필요 없으면 고객사 상세 화면에서 수정·삭제할 수 있다.
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          code: validated.code,
          name: validated.name,
          industry: validated.industry,
          contactPerson: validated.contactPerson,
          contactEmail: validated.contactEmail,
          contactPhone: validated.contactPhone,
          address: validated.address,
          contractStartDate: validated.contractStartDate
            ? new Date(validated.contractStartDate)
            : null,
          contractEndDate: validated.contractEndDate ? new Date(validated.contractEndDate) : null,
          isActive: true,
        },
      });

      await tx.serviceCategory.create({
        data: {
          clientId: client.id,
          categoryName: DEFAULT_SERVICE_CATEGORY.categoryName,
          description: DEFAULT_SERVICE_CATEGORY.description,
          slaHours: DEFAULT_SERVICE_CATEGORY.slaHours,
          priority: DEFAULT_SERVICE_CATEGORY.priority,
          isActive: true,
        },
      });

      return client;
    });

    return result;
  }

  async updateClient(id: string, data: ClientUpdateData) {
    const validated = clientUpdateSchema.parse(data);

    // 기존 고객사 정보 확인
    const existingClient = await prisma.client.findUnique({ where: { id } });
    if (!existingClient) {
      throw new NotFoundError('고객사', id);
    }

    const result = await prisma.client.update({
      where: { id },
      data: {
        name: validated.name,
        industry: validated.industry,
        contactPerson: validated.contactPerson,
        contactEmail: validated.contactEmail,
        contactPhone: validated.contactPhone,
        address: validated.address,
        contractStartDate: validated.contractStartDate
          ? new Date(validated.contractStartDate)
          : null,
        contractEndDate: validated.contractEndDate ? new Date(validated.contractEndDate) : null,
      },
    });

    return result;
  }

  async deleteClient(id: string) {
    // 고객사 삭제 전 관련 데이터 확인
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundError('고객사', id);
    }

    // 참조 무결성 확인: 관련된 데이터가 있는지 체크
    const [srsCount, usersCount, serviceCategoriesCount, clientHandlersCount] = await Promise.all([
      prisma.sR.count({ where: { clientId: id } }),
      prisma.userClient.count({ where: { clientId: id } }),
      prisma.serviceCategory.count({ where: { clientId: id } }),
      prisma.clientHandler.count({ where: { clientId: id } }),
    ]);

    const hasRelatedData =
      srsCount > 0 || usersCount > 0 || serviceCategoriesCount > 0 || clientHandlersCount > 0;

    if (hasRelatedData) {
      const errorMessages: string[] = [];
      if (srsCount > 0) errorMessages.push(`${srsCount}개의 SR`);
      if (usersCount > 0) errorMessages.push(`${usersCount}개의 사용자 연결`);
      if (serviceCategoriesCount > 0)
        errorMessages.push(`${serviceCategoriesCount}개의 서비스 카테고리`);
      if (clientHandlersCount > 0) errorMessages.push(`${clientHandlersCount}개의 담당자 연결`);

      throw new ReferentialIntegrityError(
        `고객사를 삭제할 수 없습니다. 다음 관련 데이터가 존재합니다: ${errorMessages.join(', ')}. ` +
          `먼저 관련 데이터를 삭제하거나 고객사를 비활성화하세요.`
      );
    }

    // 관련 데이터가 없으면 삭제 진행
    const result = await prisma.client.delete({ where: { id } });

    return result;
  }

  async getClientWithDetailsAndCategories(id: string) {
    const client = await this.getClientDetailsById(id);
    if (!client) {
      return null;
    }

    // 모든 활성화된 서비스 카테고리 조회 - ServiceCategoryService 활용
    const serviceCategories = await serviceCategoryService.getActiveCategories();

    // ADMIN 역할을 가진 사용자 제외
    const filteredUsers =
      (client as any).users?.filter((userClient: any) => {
        const hasAdminRole = userClient.user?.roles?.some(
          (userRole: any) => userRole.role?.name === 'ADMIN'
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
