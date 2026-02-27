import { SRPriority } from '@prisma/client';
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
const SLA_PRIORITY_MULTIPLIERS: Record<SRPriority, number> = {
  CRITICAL: 0.5,
  HIGH: 0.75,
  MEDIUM: 1.0,
  LOW: 1.5,
};

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
   * 모든 서비스 카테고리 조회
   */
  async getAll() {
    return prisma.serviceCategory.findMany({
      include: {
        client: { select: { id: true, code: true, name: true } },
        handler: { select: { id: true, name: true, email: true } },
        backupHandler: { select: { id: true, name: true, email: true } },
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
  async getForSelection(params?: { clientIds?: string[] }) {
    const { clientIds } = params || {};

    return prisma.serviceCategory.findMany({
      where: {
        isActive: true,
        ...(clientIds && {
          OR: [{ clientId: { in: clientIds } }, { clientId: null }],
        }),
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

    // 동일 고객사 내 카테고리명 중복 확인
    const existing = await prisma.serviceCategory.findFirst({
      where: {
        categoryName: validated.categoryName,
        clientId: validated.clientId ?? null,
      },
    });

    if (existing) {
      throw new DuplicateError('서비스 카테고리', 'categoryName', validated.categoryName);
    }

    return prisma.serviceCategory.create({
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

    return prisma.serviceCategory.update({
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
    return SLA_PRIORITY_MULTIPLIERS[priority];
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

    const multiplier = this.getSLAMultiplier(priority);
    const adjustedHours = category.slaHours * multiplier;

    const dueDate = new Date(startDate);
    dueDate.setHours(dueDate.getHours() + adjustedHours);

    return dueDate;
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

    const dueDate = new Date(startDate);
    dueDate.setHours(dueDate.getHours() + adjustedHours);

    return dueDate;
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
