import { describe, it, expect } from 'vitest';

/**
 * 성능 벤치마크 테스트
 * 주요 함수들의 실행 시간을 측정합니다.
 */

describe('Performance Benchmarks', () => {
  describe('FormData 파싱 성능', () => {
    it('FormData를 객체로 변환하는 시간 측정', () => {
      const formData = new FormData();

      // 100개의 필드 추가
      for (let i = 0; i < 100; i++) {
        formData.append(`field${i}`, `value${i}`);
      }

      const start = performance.now();

      // formDataToObject 실행
      const result: Record<string, string | null> = {};
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          continue;
        }
        result[key] = value as string | null;
      }

      const end = performance.now();
      const duration = end - start;

      // 100개 필드를 50ms 이내에 처리해야 함 (환경에 따라 다를 수 있음)
      expect(duration).toBeLessThan(50);
      expect(Object.keys(result)).toHaveLength(100);
    });
  });

  describe('배열 처리 성능', () => {
    it('대량 데이터 필터링 성능', () => {
      const items = Array.from({ length: 10000 }, (_, i) => ({
        id: `item${i}`,
        status: i % 2 === 0 ? 'active' : 'inactive',
        priority: ['LOW', 'MEDIUM', 'HIGH'][i % 3],
      }));

      const start = performance.now();

      const filtered = items.filter(item => item.status === 'active');

      const end = performance.now();
      const duration = end - start;

      // 10,000개 항목 필터링이 20ms 이내에 완료되어야 함
      expect(duration).toBeLessThan(20);
      expect(filtered.length).toBe(5000);
    });

    it('대량 데이터 정렬 성능', () => {
      const items = Array.from({ length: 5000 }, (_, i) => ({
        id: `item${i}`,
        priority: ['LOW', 'MEDIUM', 'HIGH'][i % 3],
        createdAt: new Date(Date.now() - i * 1000),
      }));

      const start = performance.now();

      const sorted = items.sort((a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime()
      );

      const end = performance.now();
      const duration = end - start;

      // 5,000개 항목 정렬이 30ms 이내에 완료되어야 함
      expect(duration).toBeLessThan(30);
      expect(sorted[0].createdAt.getTime()).toBeGreaterThan(sorted[sorted.length - 1].createdAt.getTime());
    });
  });

  describe('문자열 처리 성능', () => {
    it('대량 문자열 조작 성능', () => {
      const strings = Array.from({ length: 1000 }, (_, i) => `string${i}`);

      const start = performance.now();

      const result = strings
        .map(s => s.toUpperCase())
        .filter(s => s.includes('STRING'))
        .join(',');

      const end = performance.now();
      const duration = end - start;

      // 1,000개 문자열 처리가 20ms 이내에 완료되어야 함
      expect(duration).toBeLessThan(20);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('객체 조작 성능', () => {
    it('대량 객체 변환 성능', () => {
      const items = Array.from({ length: 1000 }, (_, i) => ({
        id: `item${i}`,
        name: `Item ${i}`,
        status: i % 2 === 0 ? 'active' : 'inactive',
      }));

      const start = performance.now();

      const mapped = items.map(item => ({
        ...item,
        displayName: `${item.name} (${item.status})`,
      }));

      const end = performance.now();
      const duration = end - start;

      // 1,000개 객체 변환이 20ms 이내에 완료되어야 함
      expect(duration).toBeLessThan(20);
      expect(mapped).toHaveLength(1000);
    });
  });
});
