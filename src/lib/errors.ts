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
 * Prisma 알려진 요청 오류(P####)를 도메인 에러로 변환합니다.
 * 매핑 대상이 아니면 null 을 반환하므로 호출측에서 원본 오류를 그대로 전파하면 됩니다.
 *
 * - P2003(외래키 제약 위반): 존재하지 않는 ID를 참조한 잘못된 입력이므로 400 으로 내린다.
 *   (매핑이 없으면 원시 Prisma 오류가 그대로 500 으로 노출되어, 사용자는 서버 장애로 오인하고
 *    로그에는 스택만 남는다.)
 *
 * Prisma 런타임 타입을 import 하지 않고 code 속성으로만 판정한다.
 * (errors.ts 는 서버/클라이언트 양쪽에서 import 되므로 런타임 의존성을 늘리지 않는다.)
 */
export function mapPrismaError(error: unknown): ServiceError | null {
  // 이미 도메인 에러로 변환된 경우는 그대로 둔다. (ServiceError.code 도 문자열이므로 먼저 걸러낸다.)
  if (error instanceof ServiceError) {
    return null;
  }

  const code = (error as { code?: unknown } | null | undefined)?.code;

  if (code === 'P2003') {
    return new BadRequestError('존재하지 않는 대상을 참조했습니다. 입력값을 다시 확인해주세요.');
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
