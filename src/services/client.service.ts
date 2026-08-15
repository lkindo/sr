import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { DuplicateError, NotFoundError, ReferentialIntegrityError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { clientCreateSchema, clientUpdateSchema } from '@/lib/schemas';

import { auditService } from './audit.service';
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
        // 이 고객사의 카테고리만 온다(Prisma 관계이므로 `clientId = id` 로 자동 스코프).
        // `handler` 를 여기서 함께 가져오는 이유: 상세 화면이 담당자 이름/이메일을
        // 렌더한다(clients/[id]/page.tsx:489). 예전에는 이 값을 쓰지 않고 아래
        // getClientWithDetailsAndCategories 가 **전 고객사 카탈로그**로 덮어썼는데,
        // 그 경로가 handler 를 포함했기 때문에 화면이 우연히 동작하고 있었다.
        serviceCategories: {
          include: {
            handler: { select: { id: true, name: true, email: true } },
          },
          orderBy: { categoryName: 'asc' },
        },
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

  /**
   * 셀렉트 박스용 고객사 목록.
   *
   * **비활성 고객사는 선택지에서 뺀다.** 예전에는 `isActive` 를 보지 않아
   * 비활성화한 고객사가 SR 등록·수정 다이얼로그에 그대로 떴고, 고를 수도 있었다.
   * 그러면 고객사 비활성화가 신규 SR 에 대해 아무 의미가 없다.
   *
   * @param clientIds 외부 사용자 스코프. 주어지면 그 안으로만 한정한다.
   * @param options.includeId 상태와 무관하게 반드시 포함할 고객사.
   *   수정 다이얼로그가 쓴다 — 이미 비활성이 된 고객사의 SR 을 열었을 때
   *   현재 값이 선택지에서 사라지면 셀렉트가 빈 채로 뜨고, 저장 시 무엇이
   *   들어갈지 알 수 없게 된다. 기존 값은 보이되 새로 고를 수는 없어야 한다.
   */
  async getClientsForSelection(clientIds?: string[], options?: { includeId?: string }) {
    const where: Prisma.ClientWhereInput = {
      OR: [{ isActive: true }, ...(options?.includeId ? [{ id: options.includeId }] : [])],
    };

    // 외부 사용자 스코프는 위 조건과 AND 로 묶인다(Prisma 최상위 필드는 AND).
    if (clientIds) {
      where.id = { in: clientIds };
    }

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
  async createClient(data: ClientCreateData, actorId?: string | null, ipAddress?: string | null) {
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
          // 기본은 활성이지만, 명시적으로 false 를 보내면 존중한다.
          // 하드코딩된 true 로 두면 update 쪽과 계약이 어긋나 "받아 놓고 버리는" 필드가 또 생긴다.
          isActive: validated.isActive ?? true,
        },
      });

      const defaultCategory = await tx.serviceCategory.create({
        data: {
          clientId: client.id,
          categoryName: DEFAULT_SERVICE_CATEGORY.categoryName,
          description: DEFAULT_SERVICE_CATEGORY.description,
          slaHours: DEFAULT_SERVICE_CATEGORY.slaHours,
          priority: DEFAULT_SERVICE_CATEGORY.priority,
          isActive: true,
        },
      });

      // 감사 로그도 같은 트랜잭션 안에서 남긴다. auditService.createLog 는 실패 시
      // 예외를 전파해 원자적 롤백을 트리거하므로, 트랜잭션 밖에서 부르면
      // "고객사는 생겼는데 기록은 없다" 가 된다.
      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'CLIENT_CREATE',
        targetEntity: 'Client',
        targetId: client.id,
        changes: {
          after: client,
          // 함께 시드된 기본 카테고리도 요약으로 남긴다 — 이 생성이 왜 카테고리를
          // 하나 만들었는지 나중에 추적할 수 있어야 한다(감사 3.18).
          defaultServiceCategory: {
            id: defaultCategory.id,
            categoryName: defaultCategory.categoryName,
          },
        },
        ipAddress,
      });

      return client;
    });

    return result;
  }

  /**
   * 고객사를 수정합니다.
   *
   * 활성/비활성 토글도 이 경로다(`isActive`). 별도 메서드가 없으므로 감사 로그도
   * `CLIENT_UPDATE` 하나로 덮인다 — before/after 를 보면 무엇이 바뀌었는지 나온다.
   */
  async updateClient(
    id: string,
    data: ClientUpdateData,
    actorId?: string | null,
    ipAddress?: string | null
  ) {
    const validated = clientUpdateSchema.parse(data);

    // 기존 고객사 정보 확인 (감사 로그의 `before` 로도 그대로 쓴다)
    const existingClient = await prisma.client.findUnique({ where: { id } });
    if (!existingClient) {
      throw new NotFoundError('고객사', id);
    }

    // 감사 로그 실패는 예외를 던져 롤백을 트리거한다. 그래서 수정과 로그는
    // 반드시 한 트랜잭션이어야 한다 — 밖에서 부르면 "수정은 됐는데 기록은 없다" 가 된다.
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: { id },
        data: {
          name: validated.name,
          industry: validated.industry,
          contactPerson: validated.contactPerson,
          contactEmail: validated.contactEmail,
          contactPhone: validated.contactPhone,
          address: validated.address,
          ...(validated.contractStartDate !== undefined
            ? {
                contractStartDate: validated.contractStartDate
                  ? new Date(validated.contractStartDate)
                  : null,
              }
            : {}),
          ...(validated.contractEndDate !== undefined
            ? {
                contractEndDate: validated.contractEndDate
                  ? new Date(validated.contractEndDate)
                  : null,
              }
            : {}),
          // undefined 면 Prisma 가 해당 컬럼을 건드리지 않으므로 부분 수정이 그대로 유지된다.
          isActive: validated.isActive,
        },
      });

      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'CLIENT_UPDATE',
        targetEntity: 'Client',
        targetId: id,
        changes: { before: existingClient, after: updated },
        ipAddress,
      });

      return updated;
    });

    return result;
  }

  async deleteClient(id: string, actorId?: string | null, ipAddress?: string | null) {
    // 고객사 삭제 전 관련 데이터 확인 (감사 로그의 `before` 로도 그대로 쓴다)
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundError('고객사', id);
    }

    // 참조 무결성 확인: 관련된 데이터가 있는지 체크
    //
    // **여기서만 `SR_ALIVE` 를 붙이지 않는다.** 이 카운트는 화면에 보여 줄 목록이 아니라
    // DB 제약(`client_id` FK 는 ON DELETE RESTRICT)을 앱에서 미리 재현하는 가드다.
    // soft delete 된 SR 도 행은 남아 있으므로, 여기서 제외하면 앱 검사는 통과하고
    // 실제 DELETE 에서 FK 위반이 터져 500 이 된다 — 사용자에게는 원인 없는 실패로 보인다.
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

    // 관련 데이터가 없으면 삭제 진행.
    // 참조 무결성 검사는 위(트랜잭션 밖)에 그대로 둔다 — role.service.deleteRole 과 같은 구조다.
    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.client.delete({ where: { id } });

      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'CLIENT_DELETE',
        targetEntity: 'Client',
        targetId: id,
        changes: { before: client },
        ipAddress,
      });

      return deleted;
    });

    return result;
  }

  async getClientWithDetailsAndCategories(id: string) {
    const client = await this.getClientDetailsById(id);
    if (!client) {
      return null;
    }

    // ⚠️ 여기서 serviceCategories 를 다시 조회하지 않는다.
    //
    // 예전에는 `serviceCategoryService.getActiveCategories()` 로 **전 고객사의**
    // 활성 카테고리를 가져와 위에서 이미 스코프된 값을 덮어썼다. 그 조회에는
    // clientId 필터가 없고 `client` 관계까지 include 하므로, 자사 상세를 여는
    // 것만으로 타 고객사의 카테고리명·고객사명·코드가 응답에 실려 나갔다.
    // 실측(CLIENT_ADMIN/TEST001): 카테고리 5건 중 2건이 TEST002 의 것이었다.
    //
    // 격리 원칙 위반이면서, 화면상으로도 "이 고객사의 서비스 카테고리 (5)" 가
    // 남의 것을 세고 있었다.

    // ADMIN 역할을 가진 사용자 제외
    const filteredUsers =
      (client as any).users?.filter((userClient: any) => {
        const hasAdminRole = userClient.user?.roles?.some(
          (userRole: any) => userRole.role?.name === 'ADMIN'
        );
        return !hasAdminRole;
      }) || [];

    // serviceCategories 는 `...client` 로 그대로 전달된다 — 이미 이 고객사로 스코프돼 있다.
    return {
      ...client,
      users: filteredUsers,
    };
  }
}
