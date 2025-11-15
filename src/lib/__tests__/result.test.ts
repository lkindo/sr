import { describe, it, expect } from 'vitest';
import { ok, fail, Result } from '../result';

describe('Result', () => {
  describe('ok', () => {
    it('성공 결과를 생성해야 함', () => {
      const result = ok({ id: '1', name: 'Test' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ id: '1', name: 'Test' });
      }
    });
  });

  describe('fail', () => {
    it('실패 결과를 생성해야 함', () => {
      const result = fail('오류가 발생했습니다.', 'ERROR_CODE');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('오류가 발생했습니다.');
        expect(result.code).toBe('ERROR_CODE');
      }
    });

    it('기본 에러 코드를 사용해야 함', () => {
      const result = fail('오류가 발생했습니다.');

      expect(result.success).toBe(false);
      if (!result.success) {
        // code는 optional이므로 undefined일 수 있음
        expect(result.code).toBeUndefined();
      }
    });
  });

  describe('Result 타입 가드', () => {
    it('성공 결과를 올바르게 타입 가드해야 함', () => {
      const result: Result<{ id: string }> = ok({ id: '1' });

      if (result.success) {
        // TypeScript가 result.data를 인식해야 함
        expect(result.data.id).toBe('1');
      }
    });

    it('실패 결과를 올바르게 타입 가드해야 함', () => {
      const result: Result<{ id: string }> = fail('오류');

      if (!result.success) {
        // TypeScript가 result.error를 인식해야 함
        expect(result.error).toBe('오류');
      }
    });
  });
});

