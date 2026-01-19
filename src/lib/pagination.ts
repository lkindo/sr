/**
 * 페이지네이션 유틸리티
 *
 * API 응답과 데이터베이스 쿼리에서 사용할 수 있는 페이지네이션 헬퍼 함수들을 제공합니다.
 */

import { z } from 'zod';

/**
 * 페이지네이션 파라미터 스키마
 */
export const paginationSchema = z.object({
  /**
   * 페이지 번호 (1부터 시작)
   * @default 1
   */
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().positive())
    .catch(1),

  /**
   * 페이지당 항목 수
   * @default 20
   */
  pageSize: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().positive().max(100))
    .catch(20),

  /**
   * 정렬 필드
   * @example "createdAt" 또는 "name"
   */
  sortBy: z.string().optional(),

  /**
   * 정렬 방향
   * @default "desc"
   */
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * 페이지네이션 파라미터 타입
 */
export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * 페이지네이션 메타데이터
 */
export interface PaginationMeta {
  /**
   * 현재 페이지 번호 (1부터 시작)
   */
  currentPage: number;

  /**
   * 페이지당 항목 수
   */
  pageSize: number;

  /**
   * 전체 항목 수
   */
  totalItems: number;

  /**
   * 전체 페이지 수
   */
  totalPages: number;

  /**
   * 이전 페이지가 있는지 여부
   */
  hasPreviousPage: boolean;

  /**
   * 다음 페이지가 있는지 여부
   */
  hasNextPage: boolean;
}

/**
 * 페이지네이션된 응답
 */
export interface PaginatedResponse<T> {
  /**
   * 현재 페이지 데이터
   */
  data: T[];

  /**
   * 페이지네이션 메타데이터
   */
  meta: PaginationMeta;
}

/**
 * 페이지네이션 메타데이터 계산
 *
 * @param currentPage - 현재 페이지 번호 (1부터 시작)
 * @param pageSize - 페이지당 항목 수
 * @param totalItems - 전체 항목 수
 * @returns 페이지네이션 메타데이터
 *
 * @example
 * ```typescript
 * const meta = calculatePaginationMeta(2, 20, 150);
 * // { currentPage: 2, pageSize: 20, totalItems: 150, totalPages: 8, ... }
 * ```
 */
export function calculatePaginationMeta(
  currentPage: number,
  pageSize: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage: currentPage > 1,
    hasNextPage: currentPage < totalPages,
  };
}

/**
 * Prisma skip/take 계산
 *
 * @param page - 페이지 번호 (1부터 시작)
 * @param pageSize - 페이지당 항목 수
 * @returns Prisma의 skip과 take 값
 *
 * @example
 * ```typescript
 * const { skip, take } = getPrismaSkipTake(2, 20);
 * // { skip: 20, take: 20 }
 *
 * const users = await prisma.user.findMany({
 *   skip,
 *   take,
 * });
 * ```
 */
export function getPrismaSkipTake(page: number, pageSize: number) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * 페이지네이션된 응답 생성
 *
 * @param data - 현재 페이지 데이터
 * @param currentPage - 현재 페이지 번호 (1부터 시작)
 * @param pageSize - 페이지당 항목 수
 * @param totalItems - 전체 항목 수
 * @returns 페이지네이션된 응답
 *
 * @example
 * ```typescript
 * const { skip, take } = getPrismaSkipTake(page, pageSize);
 * const [items, totalCount] = await Promise.all([
 *   prisma.sr.findMany({ skip, take }),
 *   prisma.sr.count(),
 * ]);
 *
 * const response = createPaginatedResponse(items, page, pageSize, totalCount);
 * ```
 */
export function createPaginatedResponse<T>(
  data: T[],
  currentPage: number,
  pageSize: number,
  totalItems: number
): PaginatedResponse<T> {
  return {
    data,
    meta: calculatePaginationMeta(currentPage, pageSize, totalItems),
  };
}

/**
 * URL에서 페이지네이션 파라미터 추출
 *
 * @param request - Next.js Request 객체
 * @returns 파싱된 페이지네이션 파라미터
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const params = extractPaginationParams(request);
 *   const { skip, take } = getPrismaSkipTake(params.page, params.pageSize);
 *   // ...
 * }
 * ```
 */
export function extractPaginationParams(request: Request): PaginationParams {
  const { searchParams } = new URL(request.url);

  return paginationSchema.parse({
    page: searchParams.get('page') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
    sortBy: searchParams.get('sortBy') || undefined,
    sortOrder: searchParams.get('sortOrder') || undefined,
  });
}

/**
 * Prisma orderBy 객체 생성
 *
 * @param sortBy - 정렬 필드
 * @param sortOrder - 정렬 방향
 * @returns Prisma orderBy 객체
 *
 * @example
 * ```typescript
 * const orderBy = getPrismaOrderBy("createdAt", "desc");
 * // { createdAt: "desc" }
 *
 * const users = await prisma.user.findMany({
 *   orderBy,
 * });
 * ```
 */
export function getPrismaOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): Record<string, 'asc' | 'desc'> | undefined {
  if (!sortBy) {
    return undefined;
  }

  return {
    [sortBy]: sortOrder,
  };
}

/**
 * 페이지네이션 헬퍼 (모든 기능 통합)
 *
 * @param request - Next.js Request 객체
 * @returns 페이지네이션에 필요한 모든 값
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const { params, skip, take, orderBy, createResponse } = usePagination(request);
 *
 *   const [items, totalCount] = await Promise.all([
 *     prisma.sr.findMany({ skip, take, orderBy }),
 *     prisma.sr.count(),
 *   ]);
 *
 *   return NextResponse.json(createResponse(items, totalCount));
 * }
 * ```
 */
export function usePagination(request: Request) {
  const params = extractPaginationParams(request);
  const { skip, take } = getPrismaSkipTake(params.page, params.pageSize);
  const orderBy = getPrismaOrderBy(params.sortBy, params.sortOrder);

  return {
    params,
    skip,
    take,
    orderBy,
    createResponse: <T>(data: T[], totalItems: number) =>
      createPaginatedResponse(data, params.page, params.pageSize, totalItems),
  };
}
