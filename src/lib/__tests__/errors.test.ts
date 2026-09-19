import { describe, expect, it, vi } from 'vitest';

import {
  BusinessRuleError,
  DuplicateError,
  errorToResult,
  ForbiddenError,
  GENERIC_500_MESSAGE,
  NotFoundError,
  ServiceError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';
import { logger } from '@/lib/logger';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { logRequest: vi.fn(), warn: vi.fn(), error: vi.fn(), logError: vi.fn() },
}));

describe('Errors Utility', () => {
  describe('ServiceError', () => {
    it('should create an instance with correct properties', () => {
      const error = new ServiceError('Test error', 'TEST_CODE', 400);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('Subclasses', () => {
    it('NotFoundError should have correct defaults', () => {
      const error = new NotFoundError('Resource');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('Resource');
    });

    it('ValidationError should have correct defaults', () => {
      const error = new ValidationError('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('errorToResult', () => {
    it('should convert ServiceError to Result and log warning', () => {
      const error = new NotFoundError('SR');
      const result = errorToResult(error);

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should convert unknown Error to Result and log error', () => {
      const error = new Error('Random crash');
      const result = errorToResult(error);

      expect(result.success).toBe(false);
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(logger.error).toHaveBeenCalled();
    });

    // 분류하지 못한 예외의 원문(Prisma·드라이버 메시지)은 운영 환경에서 사용자에게 보내지 않는다 —
    // API 라우트(handleApiError)와 같은 규칙. 예전에는 서버 액션만 원문을 그대로 돌려줬다.
    it('운영 환경에서는 분류하지 못한 예외의 원문을 가리고 고정 문구를 준다', () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        const result = errorToResult(
          new Error('Invalid `prisma.sR.findMany()` invocation: column "srs.secret" does not exist')
        );

        expect(result.error).toBe(GENERIC_500_MESSAGE);
        expect(result.error).not.toContain('prisma');
        expect(result.code).toBe('INTERNAL_ERROR');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('도메인 에러의 문구는 운영 환경에서도 그대로 준다(사용자가 이유를 알아야 한다)', () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        expect(errorToResult(new NotFoundError('SR')).error).not.toBe(GENERIC_500_MESSAGE);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('should handle non-Error objects', () => {
      const result = errorToResult('Just a string');

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(logger.error).toHaveBeenCalled();
    });
  });
  describe('Other Error Classes', () => {
    it('ForbiddenError should have correct defaults', () => {
      const error = new ForbiddenError();
      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
    });

    it('UnauthorizedError should have correct defaults', () => {
      const error = new UnauthorizedError();
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
    });

    it('DuplicateError should have correct message and code', () => {
      const error = new DuplicateError('Data', 'id', '123');
      expect(error.code).toBe('DUPLICATE');
      expect(error.statusCode).toBe(409);
      expect(error.message).toContain('이미 존재하는 Data입니다');
      expect(error.message).toContain('id: 123');
    });

    it('BusinessRuleError should have correct defaults', () => {
      const error = new BusinessRuleError('Rule broken');
      expect(error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(error.statusCode).toBe(400);
    });
  });
});
