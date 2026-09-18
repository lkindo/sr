import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

// Mock dependencies

vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed'),
  compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    userRole: {
      createMany: vi.fn(),
    },
    userClient: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    sR: { findMany: vi.fn(), count: vi.fn() },
    sRActivity: { count: vi.fn() },
    sRComment: { count: vi.fn() },
    sRStatusHistory: { count: vi.fn() },
    // 관리 이력 가드(D11 — hardDeleteUser). 기본은 없음.
    auditLog: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks 는 구현체를 지우지 않는다. 개별 테스트가 건 $transaction 오버라이드가
    // 다음 테스트로 새지 않도록 기본 위임 동작(tx = 모듈 목)으로 되돌린다.
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(prisma));
    userService = new UserService();
  });

  describe('getAllUsers', () => {
    it('calls findMany with filters when search is provided', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      await userService.getAllUsers({ clientId: undefined, search: 'test' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        })
      );
    });

    it('calls findMany with pagination when no filters are provided', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      await userService.getAllUsers({ clientId: undefined });

      expect(prisma.user.findMany).toHaveBeenCalled();
    });
  });

  describe('deactivateUser', () => {
    it('throws ValidationError if user has active SRs', async () => {
      vi.mocked(prisma.sR.findMany).mockResolvedValue([
        { id: 'sr-1', srNumber: 'SR1', status: 'IN_PROGRESS' },
      ] as any);

      await expect(userService.deactivateUser('u1')).rejects.toThrow(ValidationError);
    });

    it('deactivates user if no active SRs', async () => {
      vi.mocked(prisma.sR.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1', isActive: false } as any);

      const result = await userService.deactivateUser('u1');
      expect(result.id).toBe('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { isActive: false },
      });
    });
  });

  describe('hardDeleteUser', () => {
    beforeEach(() => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as any);
    });

    it('throws BusinessRuleError if related SR data exists', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(1);

      await expect(userService.hardDeleteUser('u1')).rejects.toThrow(BusinessRuleError);
    });

    it('throws BusinessRuleError if activity exists', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.sRActivity.count).mockResolvedValue(1);

      await expect(userService.hardDeleteUser('u1')).rejects.toThrow(BusinessRuleError);
    });

    it('deletes user if no related data exists', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.sRActivity.count).mockResolvedValue(0);
      vi.mocked(prisma.sRComment.count).mockResolvedValue(0);
      vi.mocked(prisma.sRStatusHistory.count).mockResolvedValue(0);
      vi.mocked(prisma.user.delete).mockResolvedValue({ id: 'u1' } as any);

      const result = await userService.hardDeleteUser('u1');
      expect(result.id).toBe('u1');
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });

    // 관리 행위를 한 계정을 지우면 감사 로그의 행위자가 비워져(FK SET NULL) "누가 승인했나" 에 답할 수 없다.
    // 가입 승인자는 감사 로그에만 남는다(2026-09-18 소유자 결정 D11).
    it('다른 사용자·데이터에 대한 관리 이력이 있으면 영구 삭제를 거부한다', async () => {
      vi.mocked(prisma.sR.count).mockResolvedValue(0);
      vi.mocked(prisma.sRActivity.count).mockResolvedValue(0);
      vi.mocked(prisma.sRComment.count).mockResolvedValue(0);
      vi.mocked(prisma.sRStatusHistory.count).mockResolvedValue(0);
      vi.mocked(prisma.auditLog.count).mockResolvedValue(3);

      await expect(userService.hardDeleteUser('u1')).rejects.toThrow('관리 이력');
      expect(prisma.user.delete).not.toHaveBeenCalled();
      // 본인에게 한 기록(비밀번호 변경·로그인)은 대상 칸에 신원이 남으므로 세지 않는다.
      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: { userId: 'u1', OR: [{ targetId: null }, { targetId: { not: 'u1' } }] },
      });
    });
  });

  describe('createUser', () => {
    it('creates user with userType based roles and correct password hashing', async () => {
      const txMock = {
        user: {
          create: vi.fn().mockResolvedValue({ id: 'u1' }),
          findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 't@t.com' }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'u1', email: 't@t.com' }),
        },
        role: { findFirst: vi.fn().mockResolvedValue({ id: 'r1', name: 'ENGINEER' }) },
        userRole: { createMany: vi.fn() },
        userClient: { createMany: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

      await userService.createUser({
        email: 't@t.com',
        name: 'N',
        password: 'P',
        userType: 'ENGINEER',
      });

      const { hash } = await import('bcryptjs');
      expect(hash).toHaveBeenCalledWith('P', 12);

      expect(txMock.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: 'ENGINEER' },
        })
      );
    });
  });

  describe('changePassword', () => {
    it('throws error if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(userService.changePassword('u1', 'old', 'new')).rejects.toThrow(NotFoundError);
    });

    it('throws error if current password mismatch', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        password: 'hashed-old',
      } as any);
      const { compare } = await import('bcryptjs');
      vi.mocked(compare).mockResolvedValue(false as any);

      await expect(userService.changePassword('u1', 'wrong', 'new')).rejects.toThrow(
        ValidationError
      );
    });

    it('hashes new password with correct work factor', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        password: 'hashed-old',
      } as any);
      vi.mocked(prisma.user.update).mockResolvedValue({ id: 'u1' } as any);

      const { compare, hash } = await import('bcryptjs');
      vi.mocked(compare).mockResolvedValue(true as any);

      await userService.changePassword('u1', 'old', 'new');

      expect(hash).toHaveBeenCalledWith('new', 12);
    });
  });
});
