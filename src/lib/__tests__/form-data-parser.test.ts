import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  formDataToObject,
  getFormDataValue,
  getFormDataValues,
  normalizeFormDataValue,
  parseFormData,
} from '../form-data-parser';

describe('form-data-parser', () => {
  describe('getFormDataValue', () => {
    it('FormData에서 문자열 값을 추출해야 함', () => {
      const formData = new FormData();
      formData.append('name', 'Test User');
      formData.append('email', 'test@example.com');

      expect(getFormDataValue(formData, 'name')).toBe('Test User');
      expect(getFormDataValue(formData, 'email')).toBe('test@example.com');
    });

    it('존재하지 않는 키는 null을 반환해야 함', () => {
      const formData = new FormData();
      expect(getFormDataValue(formData, 'nonexistent')).toBeNull();
    });

    it('File 객체는 null을 반환해야 함', () => {
      const formData = new FormData();
      const file = new File(['content'], 'test.txt');
      formData.append('file', file);

      expect(getFormDataValue(formData, 'file')).toBeNull();
    });
  });

  describe('getFormDataValues', () => {
    it('여러 값을 한 번에 추출해야 함', () => {
      const formData = new FormData();
      formData.append('name', 'Test User');
      formData.append('email', 'test@example.com');
      formData.append('age', '25');

      const result = getFormDataValues(formData, ['name', 'email', 'age']);

      expect(result).toEqual({
        name: 'Test User',
        email: 'test@example.com',
        age: '25',
      });
    });
  });

  describe('formDataToObject', () => {
    it('FormData를 객체로 변환해야 함', () => {
      const formData = new FormData();
      formData.append('name', 'Test User');
      formData.append('email', 'test@example.com');
      formData.append('age', '25');

      const result = formDataToObject(formData);

      expect(result).toEqual({
        name: 'Test User',
        email: 'test@example.com',
        age: '25',
      });
    });

    it('File 객체는 제외해야 함', () => {
      const formData = new FormData();
      formData.append('name', 'Test User');
      const file = new File(['content'], 'test.txt');
      formData.append('file', file);

      const result = formDataToObject(formData);

      expect(result).toEqual({
        name: 'Test User',
      });
      expect(result.file).toBeUndefined();
    });
  });

  describe('normalizeFormDataValue', () => {
    it('빈 문자열을 null로 변환해야 함 (기본값)', () => {
      expect(normalizeFormDataValue('')).toBeNull();
      expect(normalizeFormDataValue(null)).toBeNull();
    });

    it('빈 문자열을 undefined로 변환해야 함 (옵션)', () => {
      expect(normalizeFormDataValue('', { emptyAs: 'undefined' })).toBeUndefined();
    });

    it('유효한 값은 그대로 반환해야 함', () => {
      expect(normalizeFormDataValue('test')).toBe('test');
      expect(normalizeFormDataValue('123')).toBe('123');
    });
  });

  describe('parseFormData', () => {
    it('FormData를 Zod 스키마로 파싱해야 함', () => {
      const schema = z.object({
        name: z.string(),
        age: z.string().transform(Number),
      });

      const formData = new FormData();
      formData.append('name', 'Test User');
      formData.append('age', '25');

      const result = parseFormData(formData, schema);

      expect(result).toEqual({
        name: 'Test User',
        age: 25,
      });
    });
  });
});
