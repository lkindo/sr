import { describe, expect, it } from 'vitest';

import { serializeDates, serializeMany, serializeResponse } from '@/lib/serialization';

describe('serialization utility', () => {
  describe('serializeResponse', () => {
    it('should convert Date objects to ISO strings in nested objects', () => {
      const date = new Date('2025-01-01T12:00:00Z');
      const input = {
        id: 1,
        createdAt: date,
        nested: {
          updatedAt: date,
        },
      };

      const result = serializeResponse(input);
      expect(result.createdAt).toBe(date.toISOString());
      expect(result.nested.updatedAt).toBe(date.toISOString());
    });

    it('should convert Decimal objects to numbers', () => {
      class Decimal {
        constructor(private val: number) {}
        toNumber() {
          return this.val;
        }
      }
      const decimalVal = new Decimal(15.5);
      const input = {
        id: 1,
        estimatedHours: decimalVal,
      };
      const result = serializeResponse(input);
      expect(result.estimatedHours).toBe(15.5);
    });

    it('should handle arrays', () => {
      const date = new Date('2025-01-01T12:00:00Z');
      const input = [{ d: date }, { d: date }];
      const result = serializeMany(input);
      expect(result[0].d).toBe(date.toISOString());
    });
  });

  describe('serializeDates', () => {
    it('should serialize only specific fields', () => {
      const date = new Date('2025-01-01T12:00:00Z');
      const input = {
        d1: date,
        d2: date,
        other: 'value',
      };

      const result = serializeDates(input, ['d1']);
      expect(result.d1).toBe(date.toISOString());
      expect(result.d2).toBeInstanceOf(Date); // d2 remains a Date
    });

    it('should handle null values in specified fields', () => {
      const input = { d1: null as any, other: 'v' };
      const result = serializeDates(input, ['d1']);
      expect(result.d1).toBeNull();
    });
  });
});
