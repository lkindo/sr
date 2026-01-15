import { describe, it, expect, vi } from 'vitest';
import { ServiceError, errorToResult, NotFoundError, ValidationError, ForbiddenError, UnauthorizedError, DuplicateError, BusinessRuleError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    logError: vi.fn(),
  },
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
