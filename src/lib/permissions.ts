import { Session } from "next-auth";
import prisma from "@/lib/prisma";

/**
 * 사용자의 권한을 확인합니다.
 * @param userId 사용자 ID
 * @param resource 리소스 (예: "SR", "CLIENT", "USER")
 * @param action 액션 (예: "CREATE", "READ", "UPDATE", "DELETE")
 * @returns 권한이 있으면 true, 없으면 false
 */
export async function hasPermission(
  userId: string,
  resource: string,
  action: string
): Promise<boolean> {
  try {
    const userWithPermissions = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!userWithPermissions) {
      return false;
    }

    // 사용자의 모든 역할에서 권한 확인
    for (const userRole of userWithPermissions.roles) {
      for (const rolePermission of userRole.role.permissions) {
        const permission = rolePermission.permission;
        if (permission.resource === resource && permission.action === action) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * 사용자가 특정 권한을 가지고 있는지 확인하고, 없으면 에러를 던집니다.
 * @param userId 사용자 ID
 * @param resource 리소스
 * @param action 액션
 * @throws {Error} 권한이 없을 경우
 */
export async function requirePermission(
  userId: string,
  resource: string,
  action: string
): Promise<void> {
  const hasAccess = await hasPermission(userId, resource, action);
  
  if (!hasAccess) {
    throw new Error(`권한이 없습니다. 필요 권한: ${resource}.${action}`);
  }
}

/**
 * 사용자가 여러 권한 중 하나라도 가지고 있는지 확인합니다.
 * @param userId 사용자 ID
 * @param permissions 권한 배열 [{resource, action}]
 * @returns 하나라도 권한이 있으면 true
 */
export async function hasAnyPermission(
  userId: string,
  permissions: Array<{ resource: string; action: string }>
): Promise<boolean> {
  for (const perm of permissions) {
    if (await hasPermission(userId, perm.resource, perm.action)) {
      return true;
    }
  }
  return false;
}

/**
 * 사용자가 모든 권한을 가지고 있는지 확인합니다.
 * @param userId 사용자 ID
 * @param permissions 권한 배열 [{resource, action}]
 * @returns 모든 권한이 있으면 true
 */
export async function hasAllPermissions(
  userId: string,
  permissions: Array<{ resource: string; action: string }>
): Promise<boolean> {
  for (const perm of permissions) {
    if (!(await hasPermission(userId, perm.resource, perm.action))) {
      return false;
    }
  }
  return true;
}

/**
 * 사용자가 특정 역할을 가지고 있는지 확인합니다.
 * @param userId 사용자 ID
 * @param roleName 역할 이름 (예: "ADMIN", "MANAGER")
 * @returns 역할이 있으면 true
 */
export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId,
        role: {
          name: roleName,
        },
      },
    });

    return !!userRole;
  } catch (error) {
    console.error("Error checking role:", error);
    return false;
  }
}

/**
 * 사용자의 모든 권한 목록을 가져옵니다.
 * @param userId 사용자 ID
 * @returns 권한 배열
 */
export async function getUserPermissions(userId: string) {
  const userWithPermissions = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!userWithPermissions) {
    return [];
  }

  const permissions: Array<{ resource: string; action: string; description?: string }> = [];
  const seen = new Set<string>();

  for (const userRole of userWithPermissions.roles) {
    for (const rolePermission of userRole.role.permissions) {
      const permission = rolePermission.permission;
      const key = `${permission.resource}.${permission.action}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        permissions.push({
          resource: permission.resource,
          action: permission.action,
          description: permission.description || undefined,
        });
      }
    }
  }

  return permissions;
}

/**
 * 사용자의 역할 목록을 가져옵니다.
 * @param userId 사용자 ID
 * @returns 역할 배열
 */
export async function getUserRoles(userId: string) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: true,
    },
  });

  return userRoles.map((ur) => ur.role);
}


