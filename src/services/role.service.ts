import type { Permission, Role } from '@prisma/client';
import { z } from 'zod';

import { NotFoundError, ReferentialIntegrityError } from '@/lib/errors';
import {
  ensureCanCreateRole,
  ensureCanDeleteRole,
  ensureCanUpdateRole,
  ensureNoPrivilegeEscalation,
  ensureNotActorsOwnRole,
  ensureRoleNameNotReserved,
} from '@/lib/policies';
import prisma from '@/lib/prisma';
import { invalidateRolePermissions } from '@/lib/role-permissions';
import { roleCreateSchema, roleUpdateSchema } from '@/lib/schemas';
import type { AuthenticatedUser } from '@/types/session';

import { auditService } from './audit.service';

type RoleCreateData = z.infer<typeof roleCreateSchema>;
type RoleUpdateData = z.infer<typeof roleUpdateSchema>;

/**
 * 역할 불변식은 **여기**에 있다. 라우트가 아니다.
 *
 * 예전에는 `ensureCanUpdateRole` / `ensureCanDeleteRole` 이 REST 라우트에만 있었고
 * 서버 액션(`role.actions.ts`)은 `authenticateAndAuthorize` 만 통과하면 서비스로 직행했다.
 * 그 결과 "ADMIN 역할 불변", "시스템 역할 삭제 불가" 가 **한쪽 진입점에서만** 강제됐다
 * (감사 3.11). 게이트를 두 곳에 복사하면 다음에 세 번째 진입점이 생길 때 또 벌어진다.
 *
 * 그래서 `actor` 를 받아 서비스가 직접 판정한다. actor 가 없으면 시스템 호출(시드 등)로
 * 간주해 통과시킨다 — 요청 경로는 반드시 actor 를 넘겨야 한다.
 */
export class RoleService {
  async getRoleById(id: string): Promise<Role | null> {
    return prisma.role.findUnique({ where: { id } });
  }

  async getAllRoles(): Promise<
    (Role & {
      permissions: Array<{
        permission: Permission;
      }>;
      _count: {
        users: number;
      };
    })[]
  > {
    return prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    }) as Promise<
      (Role & { permissions: { permission: Permission }[]; _count: { users: number } })[]
    >;
  }

  async createRole(
    data: RoleCreateData,
    actorId?: string | null,
    ipAddress?: string | null,
    actor?: AuthenticatedUser
  ): Promise<Role> {
    const validated = roleCreateSchema.parse(data);

    // 형제 연산(update/delete)과 같은 자리에서 정책을 판정한다. 예전에는 이 경로만
    // 정책 검사가 없었고, `ensureCanCreateRole` 은 정의만 된 채 아무도 부르지 않았다.
    if (actor) {
      ensureCanCreateRole(actor);
    }

    return prisma.$transaction(async (tx) => {
      const role = await tx.role.create({ data: validated });
      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'ROLE_CREATE',
        targetEntity: 'Role',
        targetId: role.id,
        changes: { after: role },
        ipAddress,
      });
      return role;
    });
  }

  async updateRole(
    id: string,
    data: RoleUpdateData,
    actorId?: string | null,
    ipAddress?: string | null,
    actor?: AuthenticatedUser
  ): Promise<Role> {
    const validated = roleUpdateSchema.parse(data);

    const existingRole = await prisma.role.findUnique({ where: { id } });
    if (!existingRole) {
      throw new NotFoundError('역할', id);
    }

    if (actor) {
      // ADMIN 역할 불변 + 수정 권한 보유 여부
      ensureCanUpdateRole(actor, existingRole);
      // 자기 역할을 스스로 손보는 경로 차단
      ensureNotActorsOwnRole(actor, existingRole);
      // 'ADMIN' 으로의 개명 차단 — 이름만 바꿔도 전역 roles.includes('ADMIN') 이 통과한다
      ensureRoleNameNotReserved(actor, validated.name);
    }

    return prisma.$transaction(async (tx) => {
      const updatedRole = await tx.role.update({ where: { id }, data: validated });
      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'ROLE_UPDATE',
        targetEntity: 'Role',
        targetId: id,
        changes: { before: existingRole, after: updatedRole },
        ipAddress,
      });
      return updatedRole;
    });
  }

  async deleteRole(
    id: string,
    actorId?: string | null,
    ipAddress?: string | null,
    actor?: AuthenticatedUser
  ): Promise<Role> {
    // 역할 삭제 전 관련 데이터 확인
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundError('역할', id);
    }

    if (actor) {
      // 시스템 역할 삭제 불가 + 삭제 권한 보유 여부
      ensureCanDeleteRole(actor, role);
      ensureNotActorsOwnRole(actor, role);
    }

    // 참조 무결성 확인
    const usersCount = await prisma.userRole.count({ where: { roleId: id } });
    const permissionsCount = await prisma.rolePermission.count({ where: { roleId: id } });

    if (usersCount > 0) {
      throw new ReferentialIntegrityError(
        `역할을 삭제할 수 없습니다. ${usersCount}명의 사용자가 이 역할을 사용 중입니다. ` +
          `먼저 사용자의 역할을 변경한 후 삭제하세요.`
      );
    }

    if (permissionsCount > 0) {
      const { logger } = await import('@/lib/logger');
      logger.info(`역할 삭제 시 ${permissionsCount}개의 권한 연결이 함께 삭제됩니다.`, {
        roleId: id,
        permissionsCount,
      });
    }

    return prisma.$transaction(async (tx) => {
      const deletedRole = await tx.role.delete({ where: { id } });
      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'ROLE_DELETE',
        targetEntity: 'Role',
        targetId: id,
        changes: { before: role },
        ipAddress,
      });
      return deletedRole;
    });
  }

  /**
   * permissionId 목록을 `RESOURCE:ACTION` 문자열로 바꿔 상승 여부를 판정한다.
   *
   * 라우트는 id 존재 여부만 확인했다. 그래서 `GET /api/permissions` 로 전체 id 를 받아
   * 자기 역할에 POST 하면 즉시 전권이 됐다(감사 3.11).
   */
  private async assertNoEscalation(
    actor: AuthenticatedUser,
    roleId: string,
    permissionIds: string[]
  ): Promise<void> {
    const [next, current] = await Promise.all([
      prisma.permission.findMany({
        where: { id: { in: permissionIds } },
        select: { resource: true, action: true },
      }),
      prisma.rolePermission.findMany({
        where: { roleId },
        select: { permission: { select: { resource: true, action: true } } },
      }),
    ]);

    const key = (perm: { resource: string; action: string }) => `${perm.resource}:${perm.action}`;
    ensureNoPrivilegeEscalation(
      actor,
      next.map(key),
      current.map((rp) => key(rp.permission))
    );
  }

  async updateRolePermissions(
    roleId: string,
    permissionIds: string[],
    actorId?: string | null,
    ipAddress?: string | null,
    actor?: AuthenticatedUser
  ): Promise<Role | null> {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundError('역할', roleId);
    }

    if (actor) {
      ensureCanUpdateRole(actor, role);
      ensureNotActorsOwnRole(actor, role);
      await this.assertNoEscalation(actor, roleId, permissionIds);
    }

    const oldPermissions =
      prisma.rolePermission && typeof prisma.rolePermission.findMany === 'function'
        ? await prisma.rolePermission.findMany({
            where: { roleId },
            select: { permissionId: true },
          })
        : [];

    await prisma.$transaction(async (tx) => {
      // 1. 기존 권한 매핑 삭제
      await tx.rolePermission.deleteMany({
        where: { roleId },
      });

      // 2. 새 권한 매핑 생성
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId,
            permissionId,
          })),
        });
      }

      await auditService.createLog(tx, {
        userId: actorId,
        actionType: 'ROLE_PERMISSIONS_UPDATE',
        targetEntity: 'Role',
        targetId: roleId,
        changes: {
          before: oldPermissions.map((p) => p.permissionId),
          after: permissionIds,
        },
        ipAddress,
      });
    });

    // 세션의 권한은 역할→권한 캐시에서 펴진다(lib/role-permissions.ts).
    // 여기서 버리지 않으면 회수한 권한이 캐시 TTL 만큼 계속 유효하다 —
    // 인가에서 그 지연은 받아들일 수 없다.
    invalidateRolePermissions();

    // 업데이트된 역할 정보 반환
    return this.getRoleById(roleId);
  }
}
