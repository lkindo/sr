import { describe, it, expect } from 'vitest';
import {
  NotFoundError,
  BadRequestError,
  ValidationError,
  ForbiddenError,
  UnauthorizedError,
  ServiceError,
  ReferentialIntegrityError,
  errorToResult,
} from '../errors';

describe('Errors', () => {
  describe('NotFoundError', () => {
    it('기본 메시지로 생성되어야 함', () => {
      const error = new NotFoundError('리소스');
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('리소스');
      expect(error.message).toContain('찾을 수 없습니다');
      expect(error.statusCode).toBe(404);
    });

    it('커스텀 메시지로 생성되어야 함', () => {
      const error = new NotFoundError('사용자');
      expect(error.message).toContain('사용자');
      expect(error.message).toContain('찾을 수 없습니다');
    });

    it('name 속성이 올바르게 설정되어야 함', () => {
      const error = new NotFoundError('리소스');
      expect(error.name).toBe('NotFoundError');
    });
  });

  describe('BadRequestError', () => {
    it('커스텀 메시지로 생성되어야 함', () => {
      const error = new BadRequestError('잘못된 요청입니다.');
      expect(error.message).toBe('잘못된 요청입니다.');
      expect(error.statusCode).toBe(400);
    });

    it('name 속성이 올바르게 설정되어야 함', () => {
      const error = new BadRequestError('잘못된 요청');
      expect(error.name).toBe('BadRequestError');
    });
  });

  describe('ValidationError', () => {
    it('검증 오류 메시지로 생성되어야 함', () => {
      const error = new ValidationError('이메일 형식이 올바르지 않습니다.');
      expect(error.message).toBe('이메일 형식이 올바르지 않습니다.');
      expect(error.statusCode).toBe(400);
    });

    it('details를 포함할 수 있어야 함', () => {
      const details = { field: 'email', issue: 'invalid format' };
      const error = new ValidationError('검증 실패', details);
      expect(error.message).toBe('검증 실패');
      expect(error.details).toEqual(details);
    });

    it('name 속성이 올바르게 설정되어야 함', () => {
      const error = new ValidationError('검증 실패');
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('ForbiddenError', () => {
    it('권한 없음 오류로 생성되어야 함', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('접근 권한이 없습니다.');
      expect(error.statusCode).toBe(403);
    });

    it('커스텀 메시지로 생성할 수 있어야 함', () => {
      const error = new ForbiddenError('관리자만 접근 가능합니다.');
      expect(error.message).toBe('관리자만 접근 가능합니다.');
    });

    it('name 속성이 올바르게 설정되어야 함', () => {
      const error = new ForbiddenError();
      expect(error.name).toBe('ForbiddenError');
    });
  });

  describe('UnauthorizedError', () => {
    it('인증 오류로 생성되어야 함', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('인증되지 않은 사용자입니다.');
      expect(error.statusCode).toBe(401);
    });

    it('커스텀 메시지로 생성할 수 있어야 함', () => {
      const error = new UnauthorizedError('로그인이 필요합니다.');
      expect(error.message).toBe('로그인이 필요합니다.');
    });

    it('name 속성이 올바르게 설정되어야 함', () => {
      const error = new UnauthorizedError();
      expect(error.name).toBe('UnauthorizedError');
    });
  });

  describe('ServiceError', () => {
    it('서비스 오류로 생성되어야 함', () => {
      const error = new ServiceError('데이터베이스 연결 실패');
      expect(error.message).toBe('데이터베이스 연결 실패');
      expect(error.statusCode).toBe(500);
    });

    it('name 속성이 올바르게 설정되어야 함', () => {
      const error = new ServiceError('서비스 오류');
      expect(error.name).toBe('ServiceError');
    });
  });

  describe('ReferentialIntegrityError', () => {
    it('참조 무결성 오류로 생성되어야 함', () => {
      const error = new ReferentialIntegrityError('관련된 데이터가 존재합니다.');
      expect(error.message).toBe('관련된 데이터가 존재합니다.');
      expect(error.statusCode).toBe(409);
    });

    it('details를 포함할 수 있어야 함', () => {
      const details = { relatedEntity: 'User', count: 5 };
      const error = new ReferentialIntegrityError('삭제할 수 없습니다.', details);
      expect(error.details).toEqual(details);
    });

    it('name 속성이 올바르게 설정되어야 함', () => {
      const error = new ReferentialIntegrityError('참조 오류');
      expect(error.name).toBe('ReferentialIntegrityError');
    });
  });

  describe('errorToResult', () => {
    it('AppError를 Result로 변환해야 함', () => {
      const error = new NotFoundError('사용자');
      const result = errorToResult(error);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('사용자');
        expect(result.code).toBe('NOT_FOUND');
      }
    });

    it('일반 Error를 Result로 변환해야 함', () => {
      const error = new Error('일반 오류');
      const result = errorToResult(error);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('일반 오류');
        expect(result.code).toBe('INTERNAL_ERROR');
      }
    });

    it('알 수 없는 오류를 Result로 변환해야 함', () => {
      const error = 'string error';
      const result = errorToResult(error);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('알 수 없는 오류가 발생했습니다.');
        expect(result.code).toBe('UNKNOWN_ERROR');
      }
    });
  });

  describe('Error inheritance', () => {
    it('모든 커스텀 에러는 Error를 상속해야 함', () => {
      expect(new NotFoundError('test')).toBeInstanceOf(Error);
      expect(new BadRequestError('test')).toBeInstanceOf(Error);
      expect(new ValidationError('test')).toBeInstanceOf(Error);
      expect(new ForbiddenError()).toBeInstanceOf(Error);
      expect(new UnauthorizedError()).toBeInstanceOf(Error);
      expect(new ServiceError('test')).toBeInstanceOf(Error);
      expect(new ReferentialIntegrityError('test')).toBeInstanceOf(Error);
    });

    it('instanceof로 에러 타입을 구분할 수 있어야 함', () => {
      const notFoundError = new NotFoundError('test');
      const validationError = new ValidationError('test');

      expect(notFoundError instanceof NotFoundError).toBe(true);
      expect(notFoundError instanceof ValidationError).toBe(false);
      expect(validationError instanceof ValidationError).toBe(true);
      expect(validationError instanceof NotFoundError).toBe(false);
    });
  });
});
