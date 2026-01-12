import { describe, it, expect } from 'vitest';
import { validateRequestBody } from '../api-helpers';
import { ValidationError } from '@/lib/errors';
import { z } from 'zod';

describe('api-helpers', () => {
  describe('validateRequestBody', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().min(0),
    });

    it('유효한 요청 바디를 검증해야 함', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', age: 25 }),
      });

      const result = await validateRequestBody(request, testSchema);

      expect(result).toEqual({ name: 'Test', age: 25 });
    });

    it('유효하지 않은 요청 바디는 ValidationError를 던져야 함', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', age: -1 }),
      });

      await expect(validateRequestBody(request, testSchema)).rejects.toThrow(ValidationError);
    });

    it('JSON 파싱 실패 시 에러를 던져야 함', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      await expect(validateRequestBody(request, testSchema)).rejects.toThrow();
    });
  });
});


