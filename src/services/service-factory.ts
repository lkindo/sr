/**
 * 서비스 팩토리
 *
 * 서비스 인스턴스 생성을 중앙화하여 의존성 주입을 용이하게 합니다.
 * 테스트 시 mock 객체를 쉽게 주입할 수 있습니다.
 *
 * @example
 * ```typescript
 * // 프로덕션 사용
 * const srService = createSRService();
 *
 * // 테스트 사용 (mock 주입)
 * const srService = createSRService({
 *   srRepository: mockSRRepository,
 *   clientRepository: mockClientRepository,
 * });
 * ```
 */

import { SRRepository } from "@/repositories/sr.repository";
import { SRActivityRepository } from "@/repositories/sr-activity.repository";
import { SRCommentRepository } from "@/repositories/sr-comment.repository";
import { SRAttachmentRepository } from "@/repositories/sr-attachment.repository";
import { ClientRepository } from "@/repositories/client.repository";
import { ServiceCategoryRepository } from "@/repositories/service-category.repository";
import { UserRepository } from "@/repositories/user.repository";
import { RoleRepository } from "@/repositories/role.repository";

import { SRService } from "./sr.service";
import { UserService } from "./user.service";
import { ClientService } from "./client.service";
import { SRPolicy } from "@/lib/policies/sr.policy";

// ============================================================================
// Repository Factory (lazy singleton pattern)
// ============================================================================

let _srRepository: SRRepository | null = null;
let _srActivityRepository: SRActivityRepository | null = null;
let _srCommentRepository: SRCommentRepository | null = null;
let _srAttachmentRepository: SRAttachmentRepository | null = null;
let _clientRepository: ClientRepository | null = null;
let _serviceCategoryRepository: ServiceCategoryRepository | null = null;
let _userRepository: UserRepository | null = null;
let _roleRepository: RoleRepository | null = null;
let _srPolicy: SRPolicy | null = null;

/**
 * Repository 인스턴스 getter (싱글톤)
 */
export const repositories = {
    sr: () => (_srRepository ??= new SRRepository()),
    srActivity: () => (_srActivityRepository ??= new SRActivityRepository()),
    srComment: () => (_srCommentRepository ??= new SRCommentRepository()),
    srAttachment: () => (_srAttachmentRepository ??= new SRAttachmentRepository()),
    client: () => (_clientRepository ??= new ClientRepository()),
    serviceCategory: () => (_serviceCategoryRepository ??= new ServiceCategoryRepository()),
    user: () => (_userRepository ??= new UserRepository()),
    role: () => (_roleRepository ??= new RoleRepository()),
};

/**
 * Policy 인스턴스 getter (싱글톤)
 */
export const policies = {
    sr: () => (_srPolicy ??= new SRPolicy()),
};

// ============================================================================
// Service Dependencies Types
// ============================================================================

/**
 * SRService 의존성 타입
 */
export interface SRServiceDeps {
    srRepository: SRRepository;
    srActivityRepository: SRActivityRepository;
    srCommentRepository: SRCommentRepository;
    srAttachmentRepository: SRAttachmentRepository;
    clientRepository: ClientRepository;
    serviceCategoryRepository: ServiceCategoryRepository;
    srPolicy: SRPolicy;
}

/**
 * UserService 의존성 타입
 */
export interface UserServiceDeps {
    userRepository: UserRepository;
    roleRepository: RoleRepository;
    clientRepository: ClientRepository;
}

/**
 * ClientService 의존성 타입
 */
export interface ClientServiceDeps {
    clientRepository: ClientRepository;
    userRepository: UserRepository;
    serviceCategoryRepository: ServiceCategoryRepository;
    userService: UserService;
}

// ============================================================================
// Service Factory Functions
// ============================================================================

/**
 * SRService 인스턴스 생성
 *
 * @param deps - 주입할 의존성 (선택적)
 * @returns SRService 인스턴스
 */
export function createSRService(deps?: Partial<SRServiceDeps>): SRService {
    return new SRService(
        deps?.srRepository ?? repositories.sr(),
        deps?.srActivityRepository ?? repositories.srActivity(),
        deps?.srCommentRepository ?? repositories.srComment(),
        deps?.srAttachmentRepository ?? repositories.srAttachment(),
        deps?.clientRepository ?? repositories.client(),
        deps?.serviceCategoryRepository ?? repositories.serviceCategory(),
        deps?.srPolicy ?? policies.sr()
    );
}

/**
 * UserService 인스턴스 생성
 *
 * @param deps - 주입할 의존성 (선택적)
 * @returns UserService 인스턴스
 */
export function createUserService(deps?: Partial<UserServiceDeps>): UserService {
    return new UserService(
        deps?.userRepository ?? repositories.user(),
        deps?.roleRepository ?? repositories.role(),
        deps?.clientRepository ?? repositories.client()
    );
}

/**
 * ClientService 인스턴스 생성
 *
 * @param deps - 주입할 의존성 (선택적)
 * @returns ClientService 인스턴스
 */
export function createClientService(deps?: Partial<ClientServiceDeps>): ClientService {
    return new ClientService(
        deps?.clientRepository ?? repositories.client(),
        deps?.userRepository ?? repositories.user(),
        deps?.serviceCategoryRepository ?? repositories.serviceCategory(),
        deps?.userService ?? createUserService()
    );
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * 테스트용: 모든 싱글톤 인스턴스 초기화
 *
 * 테스트 격리를 위해 각 테스트 전/후에 호출
 */
export function resetAllInstances(): void {
    _srRepository = null;
    _srActivityRepository = null;
    _srCommentRepository = null;
    _srAttachmentRepository = null;
    _clientRepository = null;
    _serviceCategoryRepository = null;
    _userRepository = null;
    _roleRepository = null;
    _srPolicy = null;
}
