import { logger } from '@/lib/logger';

/**
 * 커스텀 에러 클래스들
 * 비즈니스 로직에서 발생하는 다양한 에러를 표현합니다.
 */

/**
 * 기본 Service 에러 클래스
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ServiceError';
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

/**
 * 유효성 검증 실패 에러
 */
export class ValidationError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * 리소스를 찾을 수 없음 에러
 */
export class NotFoundError extends ServiceError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource}을(를) 찾을 수 없습니다. (ID: ${id})`
      : `${resource}을(를) 찾을 수 없습니다.`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 잘못된 요청 에러
 */
export class BadRequestError extends ServiceError {
  constructor(message: string) {
    super(message, 'BAD_REQUEST', 400);
    this.name = 'BadRequestError';
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

/**
 * 요청 본문이 허용 상한을 초과했을 때(413).
 *
 * 업로드 본문을 힙에 물질화하기 **전에** 던져야 의미가 있다(감사 3.41).
 */
export class PayloadTooLargeError extends ServiceError {
  constructor(message: string) {
    super(message, 'PAYLOAD_TOO_LARGE', 413);
    this.name = 'PayloadTooLargeError';
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

/**
 * 권한 없음 에러
 */
export class UnauthorizedError extends ServiceError {
  constructor(message: string = '인증되지 않은 사용자입니다.') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * 접근 금지 에러
 */
export class ForbiddenError extends ServiceError {
  constructor(message: string = '접근 권한이 없습니다.') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * 비즈니스 규칙 위반 에러
 */
export class BusinessRuleError extends ServiceError {
  constructor(message: string) {
    super(message, 'BUSINESS_RULE_VIOLATION', 400);
    this.name = 'BusinessRuleError';
    Object.setPrototypeOf(this, BusinessRuleError.prototype);
  }
}

/**
 * 참조 무결성 위반 에러
 */
export class ReferentialIntegrityError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, 'REFERENTIAL_INTEGRITY_VIOLATION', 409, details);
    this.name = 'ReferentialIntegrityError';
    Object.setPrototypeOf(this, ReferentialIntegrityError.prototype);
  }
}

/**
 * 중복 리소스 에러
 */
export class DuplicateError extends ServiceError {
  constructor(resource: string, field: string, value: string) {
    const message = `이미 존재하는 ${resource}입니다. (${field}: ${value})`;
    super(message, 'DUPLICATE', 409);
    this.name = 'DuplicateError';
    Object.setPrototypeOf(this, DuplicateError.prototype);
  }
}

/**
 * 동시성 충돌 에러 (낙관적 잠금 실패)
 * 다른 트랜잭션이 먼저 리소스를 변경하여 현재 작업이 stale 스냅샷에 근거한 경우.
 */
export class ConflictError extends ServiceError {
  constructor(
    message: string = '다른 사용자가 먼저 이 항목을 변경했습니다. 새로고침 후 다시 시도해주세요.'
  ) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * 너무 많은 요청 에러 (Rate Limit 초과)
 */
export class TooManyRequestsError extends ServiceError {
  constructor(message: string = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.') {
    super(message, 'TOO_MANY_REQUESTS', 429);
    this.name = 'TooManyRequestsError';
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);
  }
}

/**
 * P2002(unique 제약 위반)의 `meta.target` 에서 사용자에게 보여줄 필드명을 뽑는다.
 *
 * `target` 은 드라이버/버전에 따라 `string[]`, `string`, `undefined` 로 모두 나타난다.
 * 필드명만 쓰고 **모델명과 제출값은 쓰지 않는다** — 필드명은 사용자가 방금 입력한
 * 폼 항목이라 정보 가치가 있지만, 모델명은 스키마 구조를 알려줄 뿐이다.
 */
function extractUniqueTargetFields(error: unknown): string | null {
  const target = (error as { meta?: { target?: unknown } } | null | undefined)?.meta?.target;

  if (Array.isArray(target)) {
    const fields = target.filter((t): t is string => typeof t === 'string');
    return fields.length > 0 ? fields.join(', ') : null;
  }
  if (typeof target === 'string' && target.length > 0) {
    return target;
  }
  return null;
}

/**
 * Prisma 오류를 도메인 에러로 변환합니다.
 * 매핑 대상이 아니면 null 을 반환하므로 호출측에서 원본 오류를 그대로 전파하면 됩니다.
 *
 * **왜 이 매핑이 필요한가(감사 4.1).** 매핑이 없으면 Prisma 오류가 일반 `Error` 로
 * 흘러 `handleApiError` 의 500 분기에 도달한다. 결과는 두 가지로 나쁘다.
 *   1. 클라이언트 잘못(중복 생성, 없는 ID 참조, 잘못된 enum 값)이 5xx 로 보고된다 —
 *      5xx 만 재시도하는 클라이언트가 절대 성공할 수 없는 요청을 반복한다.
 *   2. `PrismaClientValidationError` 의 메시지는 **모델명·필드 목록·생성 쿼리 형태**를
 *      담고 있어 그대로 응답 본문이 되면 스키마가 유출된다. `?status=BOGUS` 처럼
 *      자명하게 도달 가능한 경로였다.
 *
 * Prisma 런타임 타입을 import 하지 않고 code/name 속성으로만 판정한다.
 * (errors.ts 는 서버/클라이언트 양쪽에서 import 되므로 런타임 의존성을 늘리지 않는다.)
 */
export function mapPrismaError(error: unknown): ServiceError | null {
  // 이미 도메인 에러로 변환된 경우는 그대로 둔다. (ServiceError.code 도 문자열이므로 먼저 걸러낸다.)
  if (error instanceof ServiceError) {
    return null;
  }

  const code = (error as { code?: unknown } | null | undefined)?.code;
  const name = (error as { name?: unknown } | null | undefined)?.name;

  // P2002: unique 제약 위반 → 409. 중복 생성은 충돌이지 서버 장애가 아니다.
  if (code === 'P2002') {
    const fields = extractUniqueTargetFields(error);
    return new ConflictError(
      fields
        ? `이미 사용 중인 값입니다. (${fields})`
        : '이미 존재하는 값입니다. 입력값을 다시 확인해주세요.'
    );
  }

  // P2025: 대상 레코드 없음 → 404. update/delete 가 0건을 만났을 때 나온다.
  if (code === 'P2025') {
    return new NotFoundError('대상');
  }

  // P2003(외래키 제약 위반): 존재하지 않는 ID를 참조한 잘못된 입력이므로 400 으로 내린다.
  if (code === 'P2003') {
    return new BadRequestError('존재하지 않는 대상을 참조했습니다. 입력값을 다시 확인해주세요.');
  }

  // P2014: 필수 관계를 끊는 변경 → 409. 참조가 남아 있어 지울 수 없는 경우다.
  if (code === 'P2014') {
    return new ReferentialIntegrityError(
      '다른 데이터가 이 항목을 참조하고 있어 변경할 수 없습니다.'
    );
  }

  // 인자 검증 실패(잘못된 enum 값, 존재하지 않는 필드 등) → 400.
  // 원문 메시지는 스키마를 통째로 노출하므로 **절대 전달하지 않는다.**
  if (name === 'PrismaClientValidationError') {
    return new BadRequestError('요청 파라미터가 올바르지 않습니다.');
  }

  return null;
}

/**
 * ServiceError를 Result 타입으로 변환하는 헬퍼 함수
 */

export function errorToResult(error: unknown): { success: false; error: string; code?: string } {
  // Prisma 제약 위반은 도메인 에러로 정규화한 뒤 처리한다. (500 → 400)
  const mapped = mapPrismaError(error);
  if (mapped) {
    error = mapped;
  }

  if (error instanceof ServiceError) {
    // ServiceError는 비즈니스 로직상의 예외이므로 warn 레벨로 로깅 (시스템 에러인 경우 error 레벨)
    if (error.statusCode >= 500) {
      logger.logError(error);
    } else {
      logger.warn(`Service Error: ${error.message}`, {
        code: error.code,
        statusCode: error.statusCode,
      });
    }

    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    logger.error(`Unexpected Error: ${error.message}`, error);
    return {
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
    };
  }

  logger.error('Unknown Error', undefined, { rawError: error });
  return {
    success: false,
    error: '알 수 없는 오류가 발생했습니다.',
    code: 'UNKNOWN_ERROR',
  };
}

/**
 * ZodError 에서 사용자에게 보여 줄 첫 메시지를 꺼낸다.
 *
 * 13곳이 `error.issues[0].message` 를 직접 읽고 있었다. Zod 는 실패 시 항상 최소 한 건의
 * issue 를 담지만 **타입은 그것을 보장하지 않으므로**, `noUncheckedIndexedAccess` 를 켜면
 * 전부 `Object is possibly 'undefined'` 가 된다. 각 자리에 `?.` 를 뿌리면 폴백 문구가
 * 제각각이 되므로(실제로 일부는 폴백이 있고 일부는 없었다) 한 곳으로 모은다.
 *
 * issue 가 비어 있는 경우는 Zod 사용법이 잘못된 것에 가깝지만, 사용자에게 빈 문자열이
 * 가는 것보다는 일반 문구가 낫다.
 */
export function firstZodIssueMessage(
  error: { issues?: Array<{ message?: string }> },
  fallback = '입력값 검증에 실패했습니다.'
): string {
  return error.issues?.[0]?.message || fallback;
}
