import { NextResponse } from 'next/server';

import prisma from '@/lib/prisma';

// Force Node.js runtime (Prisma doesn't work in Edge Runtime)
export const runtime = 'nodejs';

// GET /api/users/sr-handlers - SR 처리 가능한 사용자 목록 조회
// SR 관련 모든 권한을 가진 사용자만 반환
export async function GET() {
  try {
    // SR 처리에 필요한 권한 목록
    const requiredPermissions = [
      'SR:CREATE',
      'SR:READ',
      'SR:UPDATE',
      'SR:DELETE',
      'SR:ASSIGN',
      'SR:STATUS_CHANGE',
      'COMMENT:CREATE',
      'COMMENT:READ',
      'COMMENT:UPDATE',
    ];

    // 모든 활성 사용자 조회 (권한 포함)
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
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
      orderBy: {
        name: 'asc',
      },
    });

    // 각 사용자의 권한 목록 추출 및 필터링
    const srHandlers = users.filter((user) => {
      // 사용자의 모든 권한을 Set으로 추출
      const userPermissions = new Set<string>();
      user.roles.forEach((userRole) => {
        userRole.role.permissions.forEach((rolePermission) => {
          userPermissions.add(
            `${rolePermission.permission.resource}.${rolePermission.permission.action}`
          );
        });
      });

      // 필요한 모든 권한을 가지고 있는지 확인
      return requiredPermissions.every((permission) => userPermissions.has(permission));
    });

    // 응답 데이터 정리 (권한 정보 제외)
    const response = srHandlers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching SR handlers:', error);
    return NextResponse.json(
      { error: 'SR 담당자 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
