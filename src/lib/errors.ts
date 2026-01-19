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
 * ServiceError를 Result 타입으로 변환하는 헬퍼 함수
 */

export function errorToResult(error: unknown): { success: false; error: string; code?: string } {
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
