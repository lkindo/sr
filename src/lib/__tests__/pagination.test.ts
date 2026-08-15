import { describe, expect, it } from 'vitest';

import {
  calculatePaginationMeta,
  createPaginatedResponse,
  getPrismaOrderBy,
  getPrismaSkipTake,
  paginationSchema,
} from '../pagination';

describe('Pagination Utils', () => {
  describe('calculatePaginationMeta', () => {
    it('should calculate correct metadata for first page', () => {
      const meta = calculatePaginationMeta(1, 20, 150);

      expect(meta).toEqual({
        currentPage: 1,
        pageSize: 20,
        totalItems: 150,
        totalPages: 8,
        hasPreviousPage: false,
        hasNextPage: true,
      });
    });

    it('should calculate correct metadata for middle page', () => {
      const meta = calculatePaginationMeta(3, 20, 150);

      expect(meta).toEqual({
        currentPage: 3,
        pageSize: 20,
        totalItems: 150,
        totalPages: 8,
        hasPreviousPage: true,
        hasNextPage: true,
      });
    });

    it('should calculate correct metadata for last page', () => {
      const meta = calculatePaginationMeta(8, 20, 150);

      expect(meta).toEqual({
        currentPage: 8,
        pageSize: 20,
        totalItems: 150,
        totalPages: 8,
        hasPreviousPage: true,
        hasNextPage: false,
      });
    });

    it('should handle edge case with exact division', () => {
      const meta = calculatePaginationMeta(2, 25, 100);

      expect(meta).toEqual({
        currentPage: 2,
        pageSize: 25,
        totalItems: 100,
        totalPages: 4,
        hasPreviousPage: true,
        hasNextPage: true,
      });
    });

    it('should handle single page case', () => {
      const meta = calculatePaginationMeta(1, 20, 10);

      expect(meta).toEqual({
        currentPage: 1,
        pageSize: 20,
        totalItems: 10,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      });
    });

    it('should handle empty results', () => {
      const meta = calculatePaginationMeta(1, 20, 0);

      expect(meta).toEqual({
        currentPage: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      });
    });
  });

  describe('getPrismaSkipTake', () => {
    it('should calculate skip and take for page 1', () => {
      const result = getPrismaSkipTake(1, 20);

      expect(result).toEqual({
        skip: 0,
        take: 20,
      });
    });

    it('should calculate skip and take for page 2', () => {
      const result = getPrismaSkipTake(2, 20);

      expect(result).toEqual({
        skip: 20,
        take: 20,
      });
    });

    it('should calculate skip and take for page 5 with pageSize 50', () => {
      const result = getPrismaSkipTake(5, 50);

      expect(result).toEqual({
        skip: 200,
        take: 50,
      });
    });
  });

  describe('createPaginatedResponse', () => {
    it('should create paginated response with data and metadata', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const response = createPaginatedResponse(data, 2, 20, 150);

      expect(response).toEqual({
        data,
        meta: {
          currentPage: 2,
          pageSize: 20,
          totalItems: 150,
          totalPages: 8,
          hasPreviousPage: true,
          hasNextPage: true,
        },
      });
    });

    it('should handle empty data array', () => {
      const response = createPaginatedResponse([], 1, 20, 0);

      expect(response.data).toEqual([]);
      expect(response.meta.totalItems).toBe(0);
      expect(response.meta.totalPages).toBe(0);
    });
  });

  // 이 블록은 원래 "임의의 sortBy 가 그대로 orderBy 가 된다"를 사양으로 못 박고 있었다.
  // 그게 감사 4.1 이 지적한 결함이다 — `?sortBy=password` 가 bcrypt 해시로 정렬하는
  // 순서 오라클이 되고, 없는 컬럼은 500 + 스키마 유출이 됐다.
  // 이제 allowlist 를 통과한 필드만 나가고, tiebreaker 가 항상 따라붙는다.
  describe('getPrismaOrderBy', () => {
    const allowed = ['createdAt', 'name', 'updatedAt'] as const;

    it('allowlist 를 통과한 필드로 정렬한다', () => {
      expect(getPrismaOrderBy('createdAt', 'desc', allowed)).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
      expect(getPrismaOrderBy('name', 'asc', allowed)).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    });

    it('allowlist 에 없는 필드는 기본 정렬로 떨어뜨린다', () => {
      // 예전에는 이 값이 그대로 Prisma orderBy 가 됐다.
      expect(getPrismaOrderBy('password', 'asc', allowed)).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('allowlist 를 주지 않으면 정렬을 무시한다', () => {
      // 호출부가 실수로 빠뜨렸을 때 임의 컬럼을 통과시키는 것보다 안전한 기본값이다.
      expect(getPrismaOrderBy('name', 'asc')).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('sortBy 가 없으면 기본 정렬을 돌려준다', () => {
      // 예전에는 undefined 를 돌려줘 ORDER BY 없이 OFFSET 페이징이 실행됐고,
      // 그래서 페이지 간 행 중복·누락이 생겼다.
      expect(getPrismaOrderBy(undefined, 'desc', allowed)).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('정렬 키가 같은 행의 순서를 고정하는 tiebreaker 가 항상 붙는다', () => {
      const orderBy = getPrismaOrderBy('updatedAt', 'desc', allowed);
      expect(orderBy[orderBy.length - 1]).toEqual({ id: 'desc' });
    });
  });

  describe('paginationSchema', () => {
    it('caps abusive page offsets by falling back to the first page', () => {
      const result = paginationSchema.parse({ page: '10001' });

      expect(result.page).toBe(1);
    });

    it('should parse valid pagination parameters', () => {
      const result = paginationSchema.parse({
        page: '2',
        pageSize: '50',
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(result).toEqual({
        page: 2,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
      });
    });

    it('should use default values when parameters are missing', () => {
      const result = paginationSchema.parse({});

      expect(result).toEqual({
        page: 1,
        pageSize: 20,
        sortBy: undefined,
        sortOrder: 'desc',
      });
    });

    it('should enforce maximum pageSize of 100', () => {
      const result = paginationSchema.parse({
        pageSize: '200',
      });

      expect(result.pageSize).toBe(20); // Falls back to default due to max constraint
    });

    it('should handle invalid page number', () => {
      const result = paginationSchema.parse({
        page: 'invalid',
      });

      expect(result.page).toBe(1); // Falls back to default
    });

    it('should handle invalid pageSize', () => {
      const result = paginationSchema.parse({
        pageSize: 'invalid',
      });

      expect(result.pageSize).toBe(20); // Falls back to default
    });

    it('should handle negative page number', () => {
      const result = paginationSchema.parse({
        page: '-5',
      });

      expect(result.page).toBe(1); // Falls back to default
    });

    it('should only accept asc or desc for sortOrder', () => {
      const result1 = paginationSchema.parse({
        sortOrder: 'asc',
      });
      expect(result1.sortOrder).toBe('asc');

      const result2 = paginationSchema.parse({
        sortOrder: 'desc',
      });
      expect(result2.sortOrder).toBe('desc');
    });
  });
});
