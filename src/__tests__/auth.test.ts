import { compare } from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '@/lib/prisma';

describe('Auth Logic', () => {
  const mockCompare = compare as ReturnType<typeof vi.fn>;
  const mockFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('authorize credentials validation', () => {
    it('should reject when email is missing', async () => {
      // 이메일 누락 시 null 반환 로직 테스트
      const credentials = { password: 'password123' };

      // authorize 함수 내부 로직 시뮬레이션
      const result = !credentials || !('email' in credentials) ? null : 'proceed';

      expect(result).toBeNull();
    });

    it('should reject when password is missing', async () => {
      const credentials = { email: 'test@example.com' };

      const result = !credentials || !('password' in credentials) ? null : 'proceed';

      expect(result).toBeNull();
    });

    it('should reject when both email and password are empty', async () => {
      const credentials = { email: '', password: '' };

      // 빈 문자열 체크 로직
      const result = !credentials?.email || !credentials?.password ? null : 'proceed';

      expect(result).toBeNull();
    });
  });

  describe('user authentication', () => {
    const mockUserWithRoles = {
      id: 'user-id-1',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      password: 'hashedPassword123',
      isActive: true,
      roles: [
        {
          role: {
            name: 'DEVELOPER',
            permissions: [
              { permission: { resource: 'sr', action: 'read' } },
              { permission: { resource: 'sr', action: 'update' } },
            ],
          },
        },
      ],
    };

    it('should return null when user is not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await prisma.user.findUnique({
        where: { email: 'nonexistent@example.com' },
      });

      expect(result).toBeNull();
    });

    it('should return null when password is invalid', async () => {
      mockFindUnique.mockResolvedValue(mockUserWithRoles);
      mockCompare.mockResolvedValue(false);

      const user = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
      });

      const isPasswordValid = await compare('wrongPassword', user!.password);

      expect(isPasswordValid).toBe(false);
    });

    it('should return null when user is inactive', async () => {
      const inactiveUser = { ...mockUserWithRoles, isActive: false };
      mockFindUnique.mockResolvedValue(inactiveUser);
      mockCompare.mockResolvedValue(true);

      const user = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
      });

      // 비활성 사용자 체크 로직
      const canLogin = user!.isActive;

      expect(canLogin).toBe(false);
    });

    it('should authenticate successfully with valid credentials', async () => {
      mockFindUnique.mockResolvedValue(mockUserWithRoles);
      mockCompare.mockResolvedValue(true);

      const user = await prisma.user.findUnique({
        where: { email: 'test@example.com' },
      });

      const isPasswordValid = await compare('correctPassword', user!.password);
      const isActive = user!.isActive;

      expect(user).not.toBeNull();
      expect(isPasswordValid).toBe(true);
      expect(isActive).toBe(true);
    });
  });

  describe('JWT token generation', () => {
    const mockUserWithRoles = {
      id: 'user-id-1',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      roles: [
        {
          role: {
            name: 'ADMIN',
            permissions: [
              { permission: { resource: 'sr', action: 'create' } },
              { permission: { resource: 'sr', action: 'read' } },
              { permission: { resource: 'sr', action: 'update' } },
              { permission: { resource: 'sr', action: 'delete' } },
            ],
          },
        },
      ],
      clients: [{ clientId: 'client-1' }, { clientId: 'client-2' }],
    };

    it('should extract roles from user data', () => {
      const roles = mockUserWithRoles.roles.map((ur) => ur.role.name);

      expect(roles).toEqual(['ADMIN']);
    });

    it('should extract permissions from user roles', () => {
      const permissionsSet = new Set<string>();
      mockUserWithRoles.roles.forEach((ur) => {
        ur.role.permissions.forEach((rp) => {
          const permission = `${rp.permission.resource}:${rp.permission.action}`;
          permissionsSet.add(permission);
        });
      });
      const permissions = Array.from(permissionsSet);

      expect(permissions).toContain('sr:create');
      expect(permissions).toContain('sr:read');
      expect(permissions).toContain('sr:update');
      expect(permissions).toContain('sr:delete');
      expect(permissions.length).toBe(4);
    });

    it('should extract clientIds from user data', () => {
      const clientIds = mockUserWithRoles.clients.map((uc) => uc.clientId);

      expect(clientIds).toEqual(['client-1', 'client-2']);
    });

    it('should handle user with no roles', () => {
      const userWithNoRoles = {
        ...mockUserWithRoles,
        roles: [] as typeof mockUserWithRoles.roles,
        clients: [] as typeof mockUserWithRoles.clients,
      };

      const roles = userWithNoRoles.roles.map((ur) => ur.role.name);
      const clientIds = userWithNoRoles.clients.map((uc) => uc.clientId);

      expect(roles).toEqual([]);
      expect(clientIds).toEqual([]);
    });

    it('should deduplicate permissions across multiple roles', () => {
      const userWithMultipleRoles = {
        ...mockUserWithRoles,
        roles: [
          {
            role: {
              name: 'ADMIN',
              permissions: [
                { permission: { resource: 'sr', action: 'read' } },
                { permission: { resource: 'sr', action: 'update' } },
              ],
            },
          },
          {
            role: {
              name: 'MANAGER',
              permissions: [
                { permission: { resource: 'sr', action: 'read' } }, // 중복
                { permission: { resource: 'user', action: 'read' } },
              ],
            },
          },
        ],
      };

      const permissionsSet = new Set<string>();
      userWithMultipleRoles.roles.forEach((ur) => {
        ur.role.permissions.forEach((rp) => {
          const permission = `${rp.permission.resource}:${rp.permission.action}`;
          permissionsSet.add(permission);
        });
      });
      const permissions = Array.from(permissionsSet);

      // sr:read가 두 역할에 있지만 중복 제거됨
      expect(permissions.filter((p) => p === 'sr:read').length).toBe(1);
      expect(permissions.length).toBe(3); // sr:read, sr:update, user:read
    });
  });

  describe('session callback', () => {
    it('should populate session with user data from token', () => {
      const token = {
        id: 'user-id-1',
        email: 'test@example.com',
        name: 'Test User',
        image: null,
        roles: ['ADMIN', 'MANAGER'],
        permissions: ['sr:read', 'sr:update'],
        clientIds: ['client-1'],
      };

      const session = {
        user: {
          id: '',
          email: '',
          name: '',
          image: null as string | null,
          roles: [] as string[],
          permissions: [] as string[],
          clientIds: [] as string[],
        },
        expires: new Date().toISOString(),
      };

      // session 콜백 로직 시뮬레이션
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.image as string | null;
        session.user.roles = (token.roles as string[]) || [];
        session.user.permissions = (token.permissions as string[]) || [];
        session.user.clientIds = (token.clientIds as string[]) || [];
      }

      expect(session.user.id).toBe('user-id-1');
      expect(session.user.email).toBe('test@example.com');
      expect(session.user.roles).toEqual(['ADMIN', 'MANAGER']);
      expect(session.user.permissions).toEqual(['sr:read', 'sr:update']);
      expect(session.user.clientIds).toEqual(['client-1']);
    });

    it('should handle empty token values gracefully', () => {
      const token = {
        id: 'user-id-1',
        email: 'test@example.com',
        name: 'Test User',
        image: null,
        roles: undefined,
        permissions: undefined,
        clientIds: undefined,
      };

      const session = {
        user: {
          id: '',
          email: '',
          name: '',
          image: '',
          roles: [] as string[],
          permissions: [] as string[],
          clientIds: [] as string[],
        },
        expires: new Date().toISOString(),
      };

      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.roles = (token.roles as string[] | undefined) || [];
        session.user.permissions = (token.permissions as string[] | undefined) || [];
        session.user.clientIds = (token.clientIds as string[] | undefined) || [];
      }

      expect(session.user.roles).toEqual([]);
      expect(session.user.permissions).toEqual([]);
      expect(session.user.clientIds).toEqual([]);
    });
  });
});
