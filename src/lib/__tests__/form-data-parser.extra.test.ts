import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  formDataToObject,
  getFormDataValue,
  getFormDataValues,
  normalizeFormDataValue,
  parseFormData,
  processFormData,
} from '../form-data-parser';

describe('form-data-parser (extra coverage)', () => {
  describe('getFormDataValue edge cases', () => {
    it('returns an empty string for an empty-string value', () => {
      const fd = new FormData();
      fd.append('empty', '');
      expect(getFormDataValue(fd, 'empty')).toBe('');
    });
  });

  describe('getFormDataValues edge cases', () => {
    it('maps missing and File keys to null and returns {} for no keys', () => {
      const fd = new FormData();
      fd.append('a', '1');
      fd.append('file', new File(['x'], 'x.txt'));

      expect(getFormDataValues(fd, ['a', 'file', 'missing'])).toEqual({
        a: '1',
        file: null,
        missing: null,
      });
      expect(getFormDataValues(fd, [])).toEqual({});
    });
  });

  describe('formDataToObject edge cases', () => {
    it('returns an empty object for empty FormData', () => {
      expect(formDataToObject(new FormData())).toEqual({});
    });

    it('preserves empty-string values', () => {
      const fd = new FormData();
      fd.append('x', '');
      expect(formDataToObject(fd)).toEqual({ x: '' });
    });
  });

  describe('parseFormData edge cases', () => {
    it('throws a ZodError when required fields are missing', () => {
      const schema = z.object({ name: z.string() });
      expect(() => parseFormData(new FormData(), schema)).toThrow(z.ZodError);
    });

    it('excludes File entries before validation', () => {
      const schema = z.object({ name: z.string() });
      const fd = new FormData();
      fd.append('name', 'carol');
      fd.append('avatar', new File(['img'], 'img.png'));
      expect(parseFormData(fd, schema)).toEqual({ name: 'carol' });
    });
  });

  describe('normalizeFormDataValue branches', () => {
    it('converts null to undefined when emptyAs is undefined', () => {
      expect(normalizeFormDataValue(null, { emptyAs: 'undefined' })).toBeUndefined();
    });

    it('converts empty string to null when emptyAs explicitly null', () => {
      expect(normalizeFormDataValue('', { emptyAs: 'null' })).toBeNull();
    });

    it('passes undefined input through unchanged', () => {
      expect(normalizeFormDataValue(undefined)).toBeUndefined();
    });

    it('treats whitespace as a non-empty value', () => {
      expect(normalizeFormDataValue('  ')).toBe('  ');
    });
  });

  describe('processFormData', () => {
    it('normalizes empty strings to null by default', () => {
      const fd = new FormData();
      fd.append('title', 'hi');
      fd.append('note', '');
      const result = processFormData<{ title: string | null; note: string | null }>(fd, {
        title: {},
        note: {},
      });
      expect(result).toEqual({ title: 'hi', note: null });
    });

    it('uses emptyAs undefined when configured', () => {
      const fd = new FormData();
      fd.append('note', '');
      const result = processFormData<{ note: string | undefined }>(fd, {
        note: { emptyAs: 'undefined' },
      });
      expect(result.note).toBeUndefined();
      expect('note' in result).toBe(true);
    });

    it('applies a transform function to the processed value', () => {
      const fd = new FormData();
      fd.append('count', '42');
      const result = processFormData<{ count: number }>(fd, {
        count: { transform: (v) => Number(v) },
      });
      expect(result.count).toBe(42);
    });

    it('passes null to transform for missing values', () => {
      const fd = new FormData();
      const received: Array<string | null> = [];
      const result = processFormData<{ flag: boolean }>(fd, {
        flag: {
          transform: (v) => {
            received.push(v);
            return v !== null;
          },
        },
      });
      expect(received).toEqual([null]);
      expect(result.flag).toBe(false);
    });

    it('treats File values as null', () => {
      const fd = new FormData();
      fd.append('doc', new File(['x'], 'x.txt'));
      const result = processFormData<{ doc: string | null }>(fd, { doc: {} });
      expect(result.doc).toBeNull();
    });

    it('falls back to null emptyAs when config omits it (config?.emptyAs || "null")', () => {
      const fd = new FormData();
      fd.append('x', '');
      const result = processFormData<{ x: string | null }>(fd, {
        x: { transform: undefined },
      });
      expect(result.x).toBeNull();
    });

    it('returns an empty object when fieldConfig is empty', () => {
      const fd = new FormData();
      fd.append('ignored', 'value');
      expect(processFormData(fd, {})).toEqual({});
    });

    it('handles multiple fields with mixed configuration', () => {
      const fd = new FormData();
      fd.append('name', 'Sam');
      fd.append('age', '30');
      fd.append('bio', '');
      const result = processFormData<{
        name: string | null;
        age: number;
        bio: string | undefined;
      }>(fd, {
        name: {},
        age: { transform: (v) => Number(v) },
        bio: { emptyAs: 'undefined' },
      });
      expect(result.name).toBe('Sam');
      expect(result.age).toBe(30);
      expect(result.bio).toBeUndefined();
    });
  });
});
