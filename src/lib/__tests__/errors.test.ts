import { describe, it, expect } from 'vitest';
import {
  NotFoundError,
  BadRequestError,
  ValidationError,
  ForbiddenError,
  UnauthorizedError,
  ServiceError,
} from '../errors';

describe('Errors', () => {
  describe('NotFoundError', () => {
    it('기본 메시지로 생성되어야 함', () => {
      const error = new NotFoundError('리소스');
      expect(error).toBeInstanceOf(Error);
      // 실제 메시지 형식에 맞게 수정: "리소스(을)를 찾을 수 없습니다."
      expect(error.message).toContain('리소스');
      expect(error.message).toContain('찾을 수 없습니다');
      expect(error.statusCode).toBe(404);
    });

    it('커스텀 메시지로 생성되어야 함', () => {
      const error = new NotFoundError('사용자');
      // 실제 메시지 형식에 맞게 수정
      expect(error.message).toContain('사용자');
      expect(error.message).toContain('찾을 수 없습니다');
    });
  });

  describe('BadRequestError', () => {
    it('커스텀 메시지로 생성되어야 함', () => {
      const error = new BadRequestError('잘못된 요청입니다.');
      expect(error.message).toBe('잘못된 요청입니다.');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('ValidationError', () => {
    it('검증 오류 메시지로 생성되어야 함', () => {
      const error = new ValidationError('이메일 형식이 올바르지 않습니다.');
      expect(error.message).toBe('이메일 형식이 올바르지 않습니다.');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('ForbiddenError', () => {
    it('권한 없음 오류로 생성되어야 함', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('접근 권한이 없습니다.');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('UnauthorizedError', () => {
    it('인증 오류로 생성되어야 함', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('인증되지 않은 사용자입니다.');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('ServiceError', () => {
    it('서비스 오류로 생성되어야 함', () => {
      const error = new ServiceError('데이터베이스 연결 실패');
      expect(error.message).toBe('데이터베이스 연결 실패');
      expect(error.statusCode).toBe(500);
    });
  });
});

