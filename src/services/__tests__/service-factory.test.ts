import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createSRService,
    createUserService,
    createClientService,
    repositories,
    policies,
    resetAllInstances,
} from '../service-factory';

// Mock all repositories with class mocks
vi.mock('@/repositories/sr.repository', () => ({
    SRRepository: class MockSRRepository {
        findById = vi.fn();
        findDetailsById = vi.fn();
        findAll = vi.fn();
        create = vi.fn();
        update = vi.fn();
        delete = vi.fn();
        count = vi.fn();
    },
}));

vi.mock('@/repositories/sr-activity.repository', () => ({
    SRActivityRepository: class MockSRActivityRepository {
        create = vi.fn();
        findBySRId = vi.fn();
    },
}));

vi.mock('@/repositories/sr-comment.repository', () => ({
    SRCommentRepository: class MockSRCommentRepository {
        create = vi.fn();
        findBySRId = vi.fn();
    },
}));

vi.mock('@/repositories/sr-attachment.repository', () => ({
    SRAttachmentRepository: class MockSRAttachmentRepository { },
}));

vi.mock('@/repositories/client.repository', () => ({
    ClientRepository: class MockClientRepository {
        findById = vi.fn();
        findAll = vi.fn();
        create = vi.fn();
    },
}));

vi.mock('@/repositories/service-category.repository', () => ({
    ServiceCategoryRepository: class MockServiceCategoryRepository {
        findById = vi.fn();
        findAll = vi.fn();
    },
}));

vi.mock('@/repositories/user.repository', () => ({
    UserRepository: class MockUserRepository {
        findById = vi.fn();
        findDetailsById = vi.fn();
        findAll = vi.fn();
    },
}));

vi.mock('@/repositories/role.repository', () => ({
    RoleRepository: class MockRoleRepository { },
}));

vi.mock('@/lib/policies/sr.policy', () => ({
    SRPolicy: class MockSRPolicy {
        ensureCanCreate = vi.fn();
        ensureCanUpdate = vi.fn();
        ensureCanDelete = vi.fn();
    },
}));

describe('Service Factory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetAllInstances();
    });

    describe('createSRService', () => {
        it('기본 의존성으로 SRService를 생성해야 함', () => {
            const service = createSRService();
            expect(service).toBeDefined();
        });

        it('커스텀 의존성으로 SRService를 생성해야 함', () => {
            const mockRepo = { findById: vi.fn() } as any;
            const service = createSRService({ srRepository: mockRepo });
            expect(service).toBeDefined();
        });
    });

    describe('createUserService', () => {
        it('기본 의존성으로 UserService를 생성해야 함', () => {
            const service = createUserService();
            expect(service).toBeDefined();
        });

        it('커스텀 의존성으로 UserService를 생성해야 함', () => {
            const mockRepo = { findById: vi.fn() } as any;
            const service = createUserService({ userRepository: mockRepo });
            expect(service).toBeDefined();
        });
    });

    describe('createClientService', () => {
        it('기본 의존성으로 ClientService를 생성해야 함', () => {
            const service = createClientService();
            expect(service).toBeDefined();
        });
    });

    describe('repositories', () => {
        it('싱글톤 패턴으로 동일한 인스턴스를 반환해야 함', () => {
            const repo1 = repositories.sr();
            const repo2 = repositories.sr();
            expect(repo1).toBe(repo2);
        });

        it('resetAllInstances 후에는 새 인스턴스를 반환해야 함', () => {
            const repo1 = repositories.sr();
            resetAllInstances();
            const repo2 = repositories.sr();
            expect(repo1).not.toBe(repo2);
        });
    });

    describe('policies', () => {
        it('싱글톤 패턴으로 동일한 인스턴스를 반환해야 함', () => {
            const policy1 = policies.sr();
            const policy2 = policies.sr();
            expect(policy1).toBe(policy2);
        });
    });
});
