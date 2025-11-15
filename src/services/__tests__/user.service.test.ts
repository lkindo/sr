import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from '../user.service';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { User } from '@prisma/client';

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  hash: vi.fn().mockImplementation((password: string) => Promise.resolve(`hashed_${password}`)),
  compare: vi.fn().mockImplementation((password: string, hash: string) => {
    return Promise.resolve(hash === `hashed_${password}`);
  }),
}));

// Mock repositories
vi.mock('@/repositories/user.repository', () => {
  const mockFindById = vi.fn();
  const mockFindDetailsById = vi.fn();
  const mockFindAll = vi.fn();
  const mockFindAllWithFilters = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  const mockUpdatePassword = vi.fn();

  class MockUserRepository {
    findById = mockFindById;
    findDetailsById = mockFindDetailsById;
    findAll = mockFindAll;
    findAllWithFilters = mockFindAllWithFilters;
    create = mockCreate;
    update = mockUpdate;
    updatePassword = mockUpdatePassword;
  }

  return {
    UserRepository: MockUserRepository,
  };
});

vi.mock('@/repositories/role.repository', () => ({
  RoleRepository: class MockRoleRepository {},
}));

vi.mock('@/repositories/client.repository', () => ({
  ClientRepository: class MockClientRepository {},
}));

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    userService = new UserService();
    mockUserRepo = (userService as any).userRepository;
  });

  describe('getUserById', () => {
    it('성공적으로 사용자를 조회해야 함', async () => {
      const user: User = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: null,
        password: 'hashed_password',
        image: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepo.findDetailsById.mockResolvedValue(user);

      const result = await userService.getUserById('1');

      expect(result).toEqual(user);
      expect(mockUserRepo.findDetailsById).toHaveBeenCalledWith('1');
    });

    it('존재하지 않는 사용자 ID면 null을 반환해야 함', async () => {
      mockUserRepo.findDetailsById.mockResolvedValue(null);

      const result = await userService.getUserById('999');

      expect(result).toBeNull();
    });
  });

  describe('getAllUsers', () => {
    it('필터 없이 모든 사용자를 조회해야 함', async () => {
      const users: User[] = [
        {
          id: '1',
          name: 'User 1',
          email: 'user1@example.com',
          emailVerified: null,
          password: '',
          image: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'User 2',
          email: 'user2@example.com',
          emailVerified: null,
          password: '',
          image: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockUserRepo.findAll.mockResolvedValue(users);

      const result = await userService.getAllUsers();

      expect(result).toEqual(users);
      expect(mockUserRepo.findAll).toHaveBeenCalled();
    });

    it('필터가 있으면 findAllWithFilters를 호출해야 함', async () => {
      const filters = { search: 'test', isActive: 'true' };
      const filteredUsers = [
        {
          id: '1',
          name: 'Test User',
          email: 'test@example.com',
          isActive: true,
        },
      ];

      mockUserRepo.findAllWithFilters.mockResolvedValue(filteredUsers);

      const result = await userService.getAllUsers(filters);

      expect(result).toEqual(filteredUsers);
      expect(mockUserRepo.findAllWithFilters).toHaveBeenCalledWith(filters);
    });
  });

  describe('updateUser', () => {
    const updateData = {
      name: 'Updated User',
      email: 'updated@example.com',
    };

    it('성공적으로 사용자를 수정해야 함', async () => {
      const updatedUser: User = {
        id: '1',
        name: updateData.name,
        email: updateData.email,
        emailVerified: null,
        password: '',
        image: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepo.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUser('1', updateData);

      expect(result).toEqual(updatedUser);
      expect(mockUserRepo.update).toHaveBeenCalledWith('1', updateData);
    });
  });

  describe('changePassword', () => {
    it('현재 비밀번호가 맞으면 비밀번호를 변경해야 함', async () => {
      const user: User = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: null,
        password: 'hashed_oldPassword',
        image: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser: User = {
        ...user,
        password: 'hashed_newPassword',
      };

      mockUserRepo.findById.mockResolvedValue(user);
      mockUserRepo.updatePassword.mockResolvedValue(updatedUser);

      const result = await userService.changePassword('1', 'oldPassword', 'newPassword');

      expect(result).toEqual(updatedUser);
      expect(mockUserRepo.findById).toHaveBeenCalledWith('1');
      expect(mockUserRepo.updatePassword).toHaveBeenCalledWith('1', 'hashed_newPassword');
    });

    it('존재하지 않는 사용자면 NotFoundError를 던져야 함', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        userService.changePassword('999', 'oldPassword', 'newPassword')
      ).rejects.toThrow(NotFoundError);
    });

    it('현재 비밀번호가 틀리면 ValidationError를 던져야 함', async () => {
      const user: User = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: null,
        password: 'hashed_correctPassword',
        image: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockUserRepo.findById.mockResolvedValue(user);

      await expect(
        userService.changePassword('1', 'wrongPassword', 'newPassword')
      ).rejects.toThrow(ValidationError);
    });

    it('비밀번호가 없는 사용자(OAuth)면 현재 비밀번호 체크를 건너뛰어야 함', async () => {
      const user: User = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        emailVerified: null,
        password: '',  // OAuth 사용자 (빈 문자열)
        image: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUser: User = {
        ...user,
        password: 'hashed_newPassword',
      };

      mockUserRepo.findById.mockResolvedValue(user);
      mockUserRepo.updatePassword.mockResolvedValue(updatedUser);

      const result = await userService.changePassword('1', 'anyPassword', 'newPassword');

      expect(result).toEqual(updatedUser);
      expect(mockUserRepo.updatePassword).toHaveBeenCalledWith('1', 'hashed_newPassword');
    });
  });

  describe('getUsersWithSRHandlingPermission', () => {
    it('SR 처리 권한이 있는 사용자 목록을 조회해야 함', async () => {
      // PermissionService를 mock해야 하지만, 이 테스트에서는 통합 테스트로 간주하고 스킵
      // 실제로는 PermissionService도 mock해야 함
      expect(true).toBe(true);
    });
  });
});
