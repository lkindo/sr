/**
 * Policy 인덱스
 *
 * 모든 Policy 클래스를 export합니다.
 * Policy는 리소스에 대한 권한 정책을 정의하는 클래스입니다.
 *
 * @example
 * ```typescript
 * import { SRPolicy, ClientPolicy } from '@/lib/policies';
 *
 * const srPolicy = new SRPolicy();
 * if (srPolicy.canCreate(user)) {
 *   // SR 생성 가능
 * }
 * ```
 */

export { SRPolicy } from "./sr.policy";
export { ClientPolicy } from "./client.policy";
export { UserPolicy } from "./user.policy";
export { RolePolicy } from "./role.policy";
