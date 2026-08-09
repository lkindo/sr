import { Prisma } from '@prisma/client';
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

    /**
     * 위 테스트는 **가짜 Decimal** 을 쓴다. 그 클래스의 constructor.name 은 언제나
     * 'Decimal' 이므로, 구현이 `constructor.name === 'Decimal'` 로 판별하던 시절에도
     * 통과했다. 그 사이 실제 Prisma Decimal 은 프로덕션 번들에서 이름이 축약되어
     * ('i' 같은 한 글자) 분기를 통째로 건너뛰었고, estimatedHours 가 문자열로 나갔다.
     *
     * 그래서 진짜 Prisma Decimal 로도 검증한다. 이 테스트가 있었다면 결함이
     * 프로덕션까지 가지 못했다.
     */
    it('should convert the real Prisma Decimal (not just a look-alike class)', () => {
      const real = new Prisma.Decimal('4.00');

      // 전제 확인: 실제 클래스 이름은 'Decimal' 이 아닐 수 있다. 그것이 이 테스트의 요점이다.
      expect(typeof real.toNumber).toBe('function');

      const result = serializeResponse({ id: 1, estimatedHours: real });
      expect(result.estimatedHours).toBe(4);
      expect(typeof result.estimatedHours).toBe('number');
    });

    it('should handle arrays', () => {
      const date = new Date('2025-01-01T12:00:00Z');
      const input = [{ d: date }, { d: date }];
      const result = serializeMany(input);
      expect(result[0]!.d).toBe(date.toISOString());
    });

    // Prisma BigInt 컬럼(SRAttachment.fileSize) 은 JSON.stringify 가 TypeError 를 던지므로
    // 반드시 number 로 변환되어야 한다.
    it('should convert BigInt values to numbers', () => {
      const result = serializeResponse({ fileSize: 10n });
      expect(result.fileSize).toBe(10);
      expect(typeof result.fileSize).toBe('number');
    });

    it('should convert BigInt values nested in objects and arrays', () => {
      const date = new Date('2025-01-01T12:00:00Z');
      const input = {
        id: 'sr_1',
        attachments: [
          { id: 'att_1', fileSize: 1024n, createdAt: date },
          { id: 'att_2', fileSize: 10n * 1024n * 1024n, createdAt: date },
        ],
        meta: { totalSize: 10485760n },
      };

      const result = serializeResponse(input);
      expect(result.attachments[0]!.fileSize).toBe(1024);
      expect(result.attachments[0]!.createdAt).toBe(date.toISOString());
      expect(result.attachments[1]!.fileSize).toBe(10 * 1024 * 1024);
      expect(result.meta.totalSize).toBe(10485760);
      // 변환 후에는 JSON.stringify 가 더 이상 throw 하지 않아야 한다.
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('should convert a bare BigInt passed directly', () => {
      expect(serializeResponse(10n)).toBe(10);
    });

    it('should convert BigInt items inside arrays', () => {
      expect(serializeMany([1n, 2n, 3n] as unknown as number[])).toEqual([1, 2, 3]);
    });

    it('should keep Decimal and Date behavior unchanged alongside BigInt', () => {
      class Decimal {
        constructor(private val: number) {}
        toNumber() {
          return this.val;
        }
      }
      const date = new Date('2025-01-01T12:00:00Z');
      const input = {
        estimatedHours: new Decimal(8.5),
        createdAt: date,
        fileSize: 2048n,
        title: 'SR 제목',
        isActive: true,
        assigneeId: null,
      };

      const result = serializeResponse(input);
      expect(result.estimatedHours).toBe(8.5);
      expect(result.createdAt).toBe(date.toISOString());
      expect(result.fileSize).toBe(2048);
      expect(result.title).toBe('SR 제목');
      expect(result.isActive).toBe(true);
      expect(result.assigneeId).toBeNull();
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
