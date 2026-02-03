import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '@prisma/client';

// Mock prisma
const mockPrisma = vi.hoisted(() => {
  const prismaMock: any = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
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
    role: {
      findFirst: vi.fn(),
    },
    userRole: {
      createMany: vi.fn(),
    },
    userClient: {
      createMany: vi.fn(),
    },
  };

  prismaMock.$transaction = vi.fn((callback: any) => callback(prismaMock));

  return prismaMock;
});

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
  compare: vi.fn().mockResolvedValue(true),
}));

// Mock server-only module (used by push.service.ts)
vi.mock('server-only', () => ({}));

import { UserService } from '../user.service';

describe('UserService Security', () => {
  let userService: UserService;
  const mockUserWithPassword: any = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    password: 'secret_password_hash',
    isActive: true,
    emailVerified: null,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    clients: [],
    roles: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService();
  });

  it('getUserByEmail should exclude password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserWithPassword);
    const result = await userService.getUserByEmail('test@example.com');
    expect(result).toBeDefined();
    // Use type assertion to unknown to verify runtime behavior despite type definitions
    expect((result as unknown as any).password).toBeUndefined();
    expect(result?.email).toBe('test@example.com');
  });

  it('getUserByClientId should exclude password', async () => {
    mockPrisma.user.findMany.mockResolvedValue([mockUserWithPassword]);
    const result = await userService.getUserByClientId('client-1');
    expect(result).toHaveLength(1);
    expect((result[0] as unknown as any).password).toBeUndefined();
  });

  it('getAllUsers should exclude password', async () => {
     mockPrisma.user.findMany.mockResolvedValue([mockUserWithPassword]);
     mockPrisma.user.count.mockResolvedValue(1);
     const result = await userService.getAllUsers();
     expect(result.data).toHaveLength(1);
     expect((result.data[0] as unknown as any).password).toBeUndefined();
  });

  it('updateUser should exclude password', async () => {
      mockPrisma.user.update.mockResolvedValue(mockUserWithPassword);
      // Mock validation success (schema validation happens in service)
      const updateData = { name: 'New Name' };

      // We need to mock findUnique for the "system team check" inside updateUser
      mockPrisma.user.findUnique.mockResolvedValue({ roles: [] });

      const result = await userService.updateUser('user-1', updateData);
      expect((result as unknown as any).password).toBeUndefined();
  });

  it('createUser should exclude password', async () => {
    // Mock user creation
    mockPrisma.user.create.mockResolvedValue(mockUserWithPassword);
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue(mockUserWithPassword);

    const newUser = {
        email: 'new@example.com',
        name: 'New User',
        password: 'Password123!',
        userType: 'ENGINEER' as const
    };

    const result = await userService.createUser(newUser);
    expect((result as unknown as any).password).toBeUndefined();
  });

  it('changePassword should exclude password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserWithPassword);
    mockPrisma.user.update.mockResolvedValue(mockUserWithPassword);

    const result = await userService.changePassword('user-1', 'oldPass', 'newPass');
    expect((result as unknown as any).password).toBeUndefined();
  });
});
