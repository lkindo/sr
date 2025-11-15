import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionService } from '../permission.service';

// Mock repositories
const mockFindDetailsById = vi.fn();
const mockFindAll = vi.fn();

vi.mock('@/repositories/user.repository', () => ({
  UserRepository: class MockUserRepository {
    findDetailsById = mockFindDetailsById;
  },
}));

vi.mock('@/repositories/permission.repository', () => ({
  PermissionRepository: class MockPermissionRepository {
    findAll = mockFindAll;
  },
}));

describe('PermissionService', () => {
  let permissionService: PermissionService;
  let mockUserRepository: any;
  let mockPermissionRepository: any;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionService = new PermissionService();
    mockUserRepository = (permissionService as any).userRepository;
    mockPermissionRepository = (permissionService as any).permissionRepository;
    
    // Mock 함수들을 실제 mock 함수로 설정
    mockUserRepository.findDetailsById = mockFindDetailsById;
    mockPermissionRepository.findAll = mockFindAll;
  });

  describe('getAllPermissions', () => {
    it('모든 권한을 반환해야 함', async () => {
      const mockPermissions = [
        { id: 'perm1', resource: 'SR', action: 'CREATE' },
        { id: 'perm2', resource: 'SR', action: 'READ' },
      ];

      mockPermissionRepository.findAll.mockResolvedValue(mockPermissions);

      const result = await permissionService.getAllPermissions();

      expect(result).toEqual(mockPermissions);
      expect(mockPermissionRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('checkPermission', () => {
    it('ADMIN 역할은 모든 권한을 가져야 함', async () => {
      const mockUser = {
        id: 'user1',
        isActive: true,
        roles: [
          {
            role: {
              name: 'ADMIN',
              permissions: [],
            },
          },
        ],
      };

      mockUserRepository.findDetailsById.mockResolvedValue(mockUser);

      const result = await permissionService.checkPermission('user1', 'any:permission');

      expect(result).toBe(true);
    });

    it('권한이 있으면 true를 반환해야 함', async () => {
      const mockUser = {
        id: 'user1',
        isActive: true,
        roles: [
          {
            role: {
              name: 'USER',
              permissions: [
                {
                  permission: {
                    resource: 'SR',
                    action: 'CREATE',
                  },
                },
              ],
            },
          },
        ],
      };

      mockUserRepository.findDetailsById.mockResolvedValue(mockUser);

      const result = await permissionService.checkPermission('user1', 'SR:CREATE');

      expect(result).toBe(true);
    });

    it('권한이 없으면 false를 반환해야 함', async () => {
      const mockUser = {
        id: 'user1',
        isActive: true,
        roles: [
          {
            role: {
              name: 'USER',
              permissions: [
                {
                  permission: {
                    resource: 'SR',
                    action: 'READ',
                  },
                },
              ],
            },
          },
        ],
      };

      mockUserRepository.findDetailsById.mockResolvedValue(mockUser);

      const result = await permissionService.checkPermission('user1', 'SR:CREATE');

      expect(result).toBe(false);
    });

    it('비활성 사용자는 false를 반환해야 함', async () => {
      const mockUser = {
        id: 'user1',
        isActive: false,
        roles: [],
      };

      mockUserRepository.findDetailsById.mockResolvedValue(mockUser);

      const result = await permissionService.checkPermission('user1', 'SR:CREATE');

      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('사용자의 모든 권한을 반환해야 함', async () => {
      const mockUser = {
        id: 'user1',
        isActive: true,
        roles: [
          {
            role: {
              permissions: [
                {
                  permission: {
                    id: 'perm1',
                    resource: 'SR',
                    action: 'CREATE',
                  },
                },
                {
                  permission: {
                    id: 'perm2',
                    resource: 'SR',
                    action: 'READ',
                  },
                },
              ],
            },
          },
        ],
      };

      mockUserRepository.findDetailsById.mockResolvedValue(mockUser);

      const result = await permissionService.getUserPermissions('user1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('perm1');
      expect(result[1].id).toBe('perm2');
    });

    it('중복 권한은 제거해야 함', async () => {
      const mockUser = {
        id: 'user1',
        isActive: true,
        roles: [
          {
            role: {
              permissions: [
                {
                  permission: {
                    id: 'perm1',
                    resource: 'SR',
                    action: 'CREATE',
                  },
                },
              ],
            },
          },
          {
            role: {
              permissions: [
                {
                  permission: {
                    id: 'perm1', // 동일한 권한
                    resource: 'SR',
                    action: 'CREATE',
                  },
                },
              ],
            },
          },
        ],
      };

      mockUserRepository.findDetailsById.mockResolvedValue(mockUser);

      const result = await permissionService.getUserPermissions('user1');

      expect(result).toHaveLength(1); // 중복 제거
    });
  });
});

