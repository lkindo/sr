import { SRPriority } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { z } from 'zod';

import { DuplicateError, NotFoundError, ReferentialIntegrityError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { serviceCategoryCreateSchema, serviceCategoryUpdateSchema } from '@/lib/schemas';

type ServiceCategoryCreateData = z.infer<typeof serviceCategoryCreateSchema>;
type ServiceCategoryUpdateData = z.infer<typeof serviceCategoryUpdateSchema>;

/**
 * SLA 우선순위별 시간 배율
 * CRITICAL: 50% 시간 (긴급)
 * HIGH: 75% 시간
 * MEDIUM: 100% 시간 (기본)
 * LOW: 150% 시간 (여유)
 */
const SLA_PRIORITY_MULTIPLIERS = new Map<SRPriority, number>([
  ['CRITICAL', 0.5],
  ['HIGH', 0.75],
  ['MEDIUM', 1.0],
  ['LOW', 1.5],
]);

/**
 * 서비스 카테고리 서비스
 *
 * 서비스 카테고리 관리 및 SLA 계산 로직을 담당합니다.
 * - 서비스 카테고리 CRUD
 * - SLA 기반 기한 계산
 * - 담당자/백업 담당자 배정
 */
export class ServiceCategoryService {
  constructor() {}

  // ============================================================================
  // 조회 메서드
  // ============================================================================

  /**
   * 서비스 카테고리 조회.
   *
   * **스코프를 반드시 지정해야 한다(감사 4.1).** 예전에는 인자도 `where` 도 없이
   * 전 고객사의 카테고리를 SLA·담당자 연락처와 함께 반환했고, `/api/service-categories`
   * 가 이를 인가 검사 없이 모든 인증 사용자에게 노출했다. 고객사 X 의 사용자가 고객사 Y 의
   * 서비스 카탈로그와 담당자 이메일을 그대로 읽을 수 있었다.
   *
   * @param options.clientIds - `undefined` 면 전 고객사(내부 사용자 전용).
   *   배열이면 그 고객사들 + 글로벌 카테고리(`clientId: null`)로 제한한다.
   * @param options.includeHandlerEmail - 담당자 이메일 포함 여부. 외부 사용자에게는
   *   내부 직원의 연락처를 주지 않는다.
   */
  async getAll(options?: { clientIds?: string[]; includeHandlerEmail?: boolean }) {
    const includeEmail = options?.includeHandlerEmail ?? true;
    const handlerSelect = { id: true, name: true, email: includeEmail };

    return prisma.serviceCategory.findMany({
      where:
        options?.clientIds === undefined
          ? undefined
          : {
              isActive: true,
              // 글로벌 카테고리(clientId: null)는 모든 테넌트가 쓰는 공용 항목이다.
              OR: [{ clientId: null }, { clientId: { in: options.clientIds } }],
            },
      include: {
        client: { select: { id: true, code: true, name: true } },
        handler: { select: handlerSelect },
        backupHandler: { select: handlerSelect },
      },
      orderBy: { categoryName: 'asc' },
    });
  }

  /**
   * ID로 서비스 카테고리 조회
   */
  async getById(id: string) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, code: true, name: true } },
        handler: { select: { id: true, name: true, email: true } },
        backupHandler: { select: { id: true, name: true, email: true } },
        _count: { select: { srs: true } },
      },
    });

    if (!category) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    return category;
  }

  /**
   * 고객사 ID로 서비스 카테고리 목록 조회
   */
  async getByClientId(clientId: string | null) {
    return prisma.serviceCategory.findMany({
      where: { clientId, isActive: true },
      include: {
        handler: { select: { id: true, name: true } },
        backupHandler: { select: { id: true, name: true } },
      },
      orderBy: { categoryName: 'asc' },
    });
  }

  /**
   * 활성 서비스 카테고리만 조회
   */
  async getActiveCategories() {
    return prisma.serviceCategory.findMany({
      where: { isActive: true },
      include: {
        client: { select: { id: true, code: true, name: true } },
        handler: { select: { id: true, name: true } },
      },
      orderBy: { categoryName: 'asc' },
    });
  }

  /**
   * 선택용 간소화된 목록 조회 (드롭다운 등)
   */
  async getForSelection(clientId?: string) {
    return prisma.serviceCategory.findMany({
      where: {
        isActive: true,
        // 해당 고객사 전용 + 전역(clientId=null) 카테고리를 함께 보여준다.
        // `{ clientId }` 로 정확히 일치만 걸면 전역 카테고리가 목록에서 사라져,
        // 전역 카테고리만 있는 신규 고객사는 선택지가 0개가 된다.
        // (SRService.ensureCategoryBelongsToClient 가 허용하는 범위와 정확히 같다)
        ...(clientId && { OR: [{ clientId }, { clientId: null }] }),
      },
      select: {
        id: true,
        categoryName: true,
        slaHours: true,
        priority: true,
        handlerId: true,
      },
      orderBy: { categoryName: 'asc' },
    });
  }

  // ============================================================================
  // CRUD 메서드
  // ============================================================================

  /**
   * 서비스 카테고리 생성
   */
  async create(data: ServiceCategoryCreateData) {
    const validated = serviceCategoryCreateSchema.parse(data);

    // 사전 확인은 사용자에게 빠른 피드백을 주기 위한 것이지 중복 방지 수단이 아니다.
    // 확인과 생성 사이에 다른 요청이 끼어들 수 있으므로(TOCTOU), 실제 보장은
    // DB 의 부분 unique 인덱스가 한다 — 아래 P2002 처리 참고(감사 4.2).
    const existing = await prisma.serviceCategory.findFirst({
      where: {
        categoryName: validated.categoryName,
        clientId: validated.clientId ?? null,
      },
    });

    if (existing) {
      throw new DuplicateError('서비스 카테고리', 'categoryName', validated.categoryName);
    }

    try {
      return await prisma.serviceCategory.create({
        data: {
          categoryName: validated.categoryName,
          description: validated.description,
          slaHours: validated.slaHours,
          priority: validated.priority,
          clientId: validated.clientId,
          handlerId: validated.handlerId,
          backupHandlerId: validated.backupHandlerId,
          isActive: true,
        },
        include: {
          client: { select: { id: true, code: true, name: true } },
          handler: { select: { id: true, name: true, email: true } },
          backupHandler: { select: { id: true, name: true, email: true } },
        },
      });
    } catch (error) {
      // 경쟁에서 진 쪽. 그대로 두면 raw Prisma 오류가 500 으로 표면화된다.
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateError('서비스 카테고리', 'categoryName', validated.categoryName);
      }
      throw error;
    }
  }

  /**
   * 서비스 카테고리 수정
   */
  async update(id: string, data: ServiceCategoryUpdateData) {
    const validated = serviceCategoryUpdateSchema.parse(data);

    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    // 카테고리명 변경 시 중복 확인
    if (validated.categoryName && validated.categoryName !== existing.categoryName) {
      const duplicate = await prisma.serviceCategory.findFirst({
        where: {
          categoryName: validated.categoryName,
          clientId: validated.clientId ?? existing.clientId,
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new DuplicateError('서비스 카테고리', 'categoryName', validated.categoryName);
      }
    }

    try {
      return await prisma.serviceCategory.update({
        where: { id },
        data: {
          categoryName: validated.categoryName,
          description: validated.description,
          slaHours: validated.slaHours,
          priority: validated.priority,
          clientId: validated.clientId,
          handlerId: validated.handlerId,
          backupHandlerId: validated.backupHandlerId,
        },
        include: {
          client: { select: { id: true, code: true, name: true } },
          handler: { select: { id: true, name: true, email: true } },
          backupHandler: { select: { id: true, name: true, email: true } },
        },
      });
    } catch (error) {
      // 위 중복 확인도 create 와 같은 TOCTOU 다. 이름을 바꾸는 두 요청이 동시에
      // 통과하면 여기서 부분 unique 인덱스에 걸린다.
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateError(
          '서비스 카테고리',
          'categoryName',
          validated.categoryName ?? existing.categoryName
        );
      }
      throw error;
    }
  }

  /**
   * 서비스 카테고리 삭제
   */
  async delete(id: string) {
    const existing = await prisma.serviceCategory.findUnique({
      where: { id },
      include: { _count: { select: { srs: true } } },
    });

    if (!existing) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    // 참조 무결성 확인
    if (existing._count.srs > 0) {
      throw new ReferentialIntegrityError(
        `이 카테고리에 ${existing._count.srs}개의 SR이 연결되어 있습니다. ` +
          `삭제 대신 비활성화를 사용하세요.`
      );
    }

    return prisma.serviceCategory.delete({ where: { id } });
  }

  // ============================================================================
  // 상태 관리 메서드
  // ============================================================================

  /**
   * 서비스 카테고리 활성화
   */
  async activate(id: string) {
    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    return prisma.serviceCategory.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * 서비스 카테고리 비활성화
   */
  async deactivate(id: string) {
    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    return prisma.serviceCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ============================================================================
  // 담당자 관리 메서드
  // ============================================================================

  /**
   * 담당자 배정
   */
  async assignHandler(id: string, handlerId: string) {
    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    // 담당자 존재 확인
    const handler = await prisma.user.findUnique({ where: { id: handlerId } });
    if (!handler) {
      throw new NotFoundError('담당자', handlerId);
    }

    return prisma.serviceCategory.update({
      where: { id },
      data: { handlerId },
      include: {
        handler: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * 백업 담당자 배정
   */
  async assignBackupHandler(id: string, backupHandlerId: string) {
    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    // 백업 담당자 존재 확인
    const backupHandler = await prisma.user.findUnique({ where: { id: backupHandlerId } });
    if (!backupHandler) {
      throw new NotFoundError('백업 담당자', backupHandlerId);
    }

    return prisma.serviceCategory.update({
      where: { id },
      data: { backupHandlerId },
      include: {
        backupHandler: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * 담당자 배정 해제
   */
  async unassignHandler(id: string) {
    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    return prisma.serviceCategory.update({
      where: { id },
      data: { handlerId: null },
    });
  }

  /**
   * 백업 담당자 배정 해제
   */
  async unassignBackupHandler(id: string) {
    const existing = await prisma.serviceCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('서비스 카테고리', id);
    }

    return prisma.serviceCategory.update({
      where: { id },
      data: { backupHandlerId: null },
    });
  }

  // ============================================================================
  // SLA 계산 메서드
  // ============================================================================

  /**
   * 우선순위별 SLA 배율 조회
   */
  getSLAMultiplier(priority: SRPriority): number {
    return SLA_PRIORITY_MULTIPLIERS.get(priority) || 1.0;
  }

  /**
   * SLA 기반 기한 계산
   *
   * @param categoryId - 서비스 카테고리 ID
   * @param priority - 우선순위 (실제 적용할 우선순위)
   * @param startDate - 시작일 (기본값: 현재 시간)
   * @returns 계산된 기한
   */
  async calculateDueDate(
    categoryId: string,
    priority: SRPriority,
    startDate: Date = new Date()
  ): Promise<Date> {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
      select: { slaHours: true },
    });

    if (!category) {
      throw new NotFoundError('서비스 카테고리', categoryId);
    }

    // 계산 자체는 한 곳에만 둔다.
    return this.calculateDueDateFromHours(category.slaHours, priority, startDate);
  }

  /**
   * 카테고리 정보와 함께 기한 계산 (DB 조회 최소화용)
   *
   * @param slaHours - 카테고리의 SLA 기준 시간
   * @param priority - 우선순위
   * @param startDate - 시작일
   * @returns 계산된 기한
   */
  calculateDueDateFromHours(
    slaHours: number,
    priority: SRPriority,
    startDate: Date = new Date()
  ): Date {
    const multiplier = this.getSLAMultiplier(priority);
    const adjustedHours = slaHours * multiplier;

    /**
     * 밀리초로 더한다 — `setHours(getHours() + adjustedHours)` 를 쓰면 안 된다(감사 4.3).
     *
     * `Date.prototype.setHours` 는 인자에 `ToIntegerOrInfinity` 를 적용해 **소수를 절삭**한다.
     * 배율이 0.5 / 0.75 / 1.0 / 1.5 이므로 `adjustedHours` 는 자주 소수다:
     *   slaHours 5 × CRITICAL(0.5) = 2.5 → 예전에는 2시간. **30분이 조용히 증발**했다.
     * 홀수 slaHours 와 모든 HIGH 우선순위 SR 이 계약보다 최대 59분 이른 마감일을 받아,
     * SLA 가 만료되기 전에 지연으로 집계됐다.
     *
     * 이 함수가 마감일 계산의 **유일한 구현**이다. 예전에는 같은 구문이 네 곳에
     * 복제돼 있어 한 곳을 고쳐도 나머지가 계속 절삭했다.
     */
    return new Date(startDate.getTime() + adjustedHours * 60 * 60 * 1000);
  }

  /**
   * SR 카운트 포함 조회 (통계용)
   */
  async getAllWithStats() {
    return prisma.serviceCategory.findMany({
      include: {
        client: { select: { id: true, code: true, name: true } },
        handler: { select: { id: true, name: true } },
        _count: { select: { srs: true } },
      },
      orderBy: { categoryName: 'asc' },
    });
  }
}

/**
 * ServiceCategoryService 싱글톤 인스턴스
 */
export const serviceCategoryService = new ServiceCategoryService();
