import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';

import { RoleService } from '../role.service';
import { UserService } from '../user.service';

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed'),
  compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    role: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    userRole: {
      createMany: vi.fn(),
    },
    userClient: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    sR: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    sRActivity: {
      count: vi.fn(),
    },
    sRComment: {
      count: vi.fn(),
    },
    sRStatusHistory: {
      count: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mockPrisma)),
  };
  return {
    default: mockPrisma,
  };
});

describe('Audit Logging System Integration', () => {
  let roleService: RoleService;
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    roleService = new RoleService();
    userService = new UserService();

    // Default $transaction behavior: pass back the mock prisma object itself as tx
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(prisma));
  });

  it('역할 생성(createRole) 시 감사 로그가 정상 적재되어야 한다', async () => {
    vi.mocked(prisma.role.create).mockResolvedValue({
      id: 'role-123',
      name: 'AUDIT_TEST_ROLE',
      description: 'Test role for auditing',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const role = await roleService.createRole(
      { name: 'AUDIT_TEST_ROLE', description: 'Test role for auditing' },
      'actor-123',
      '192.168.1.100'
    );

    expect(role.id).toBe('role-123');
    expect(prisma.role.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'actor-123',
          actionType: 'ROLE_CREATE',
          targetEntity: 'Role',
          targetId: 'role-123',
          ipAddress: '192.168.1.100',
        }),
      })
    );
  });

  it('사용자 생성(createUser) 시 감사 로그가 정상 적재되어야 한다', async () => {
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user-123',
      email: 'audit-test-user@example.com',
      name: 'Audit User',
    } as any);

    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({
      id: 'user-123',
      email: 'audit-test-user@example.com',
      name: 'Audit User',
      roles: [],
      clients: [],
    } as any);

    const user = await userService.createUser(
      {
        email: 'audit-test-user@example.com',
        name: 'Audit User',
        password: 'Password123!',
        userType: 'ENGINEER',
      },
      'actor-456',
      '127.0.0.1'
    );

    expect(user.id).toBe('user-123');
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'actor-456',
          actionType: 'USER_CREATE',
          targetEntity: 'User',
          targetId: 'user-123',
          ipAddress: '127.0.0.1',
        }),
      })
    );
  });

  it('Zod 에러 등으로 트랜잭션 실패 시 감사 로그가 호출되지 않아야 한다', async () => {
    await expect(
      roleService.createRole({ name: '' } as any, 'actor-123', '192.168.1.100')
    ).rejects.toThrow();

    expect(prisma.role.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
