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

  describe('getPrismaOrderBy', () => {
    it('should create orderBy object with descending order', () => {
      const orderBy = getPrismaOrderBy('createdAt', 'desc');

      expect(orderBy).toEqual({
        createdAt: 'desc',
      });
    });

    it('should create orderBy object with ascending order', () => {
      const orderBy = getPrismaOrderBy('name', 'asc');

      expect(orderBy).toEqual({
        name: 'asc',
      });
    });

    it('should return undefined when no sortBy provided', () => {
      const orderBy = getPrismaOrderBy(undefined, 'desc');

      expect(orderBy).toBeUndefined();
    });

    it('should default to desc when no sortOrder provided', () => {
      const orderBy = getPrismaOrderBy('updatedAt');

      expect(orderBy).toEqual({
        updatedAt: 'desc',
      });
    });
  });

  describe('paginationSchema', () => {
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
