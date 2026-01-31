import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@/lib/prisma';
import { UserService } from '@/services/user.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
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
    $transaction: vi.fn((cb) => cb(prisma)),
  },
}));

// Mock bcryptjs just in case
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockResolvedValue('hashed_password'),
  compare: vi.fn().mockResolvedValue(true),
}));

describe('UserService Security', () => {
  let userService: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    userService = new UserService();
  });

  const mockUserWithPassword = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    password: 'secret_password_hash',
    userType: 'ENGINEER',
    roles: [],
    clients: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('getUserByEmail should exclude password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUserWithPassword as any);

    const user = await userService.getUserByEmail('test@example.com');

    expect(user).toBeDefined();
    expect(user).not.toHaveProperty('password');
    expect(user?.email).toBe('test@example.com');
  });

  it('getAllUsers should exclude password from all users', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([mockUserWithPassword] as any);
    vi.mocked(prisma.user.count).mockResolvedValue(1);

    const result = await userService.getAllUsers();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('password');
    expect(result.data[0].email).toBe('test@example.com');
  });

  it('updateUser should exclude password from returned user', async () => {
     vi.mocked(prisma.user.update).mockResolvedValue(mockUserWithPassword as any);
     // mock findUnique for role check in updateUser if clientIds provided, but here we don't provide them so it might skip.
     // actually updateUser calls userUpdateSchema.parse which strips unknown keys.
     // We need to provide valid data.

     const user = await userService.updateUser('user-1', { name: 'New Name' });

     expect(user).not.toHaveProperty('password');
  });

  it('createUser should exclude password from returned user', async () => {
    vi.mocked(prisma.user.create).mockResolvedValue(mockUserWithPassword as any);
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue(mockUserWithPassword as any);
    vi.mocked(prisma.role.findFirst).mockResolvedValue({ id: 'role-1' } as any);

    const user = await userService.createUser({
      email: 'new@example.com',
      name: 'New User',
      password: 'password123',
      userType: 'ENGINEER',
    });

    expect(user).not.toHaveProperty('password');
  });
});
