/**
 * 페이지네이션 유틸리티
 *
 * API 응답과 데이터베이스 쿼리에서 사용할 수 있는 페이지네이션 헬퍼 함수들을 제공합니다.
 *
 * [응답 봉투 규약]
 * - 목록 조회 (list): { data: T[], meta: PaginationMeta }
 * - 단건 조회 (single): bare object T
 * - 본문 없는 변이 (body-less mutation): { success: boolean }
 *
 * [예외 목록 (레거시/특수 규약)]
 * - GET /api/roles
 * - GET /api/permissions
 * - GET /api/service-categories
 * - GET /api/clients/[id]
 */

import { z } from 'zod';

import { PAGINATION } from '@/lib/constants';

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
    .pipe(z.number().int().positive().max(PAGINATION.MAX_PAGE))
    .catch(1),

  /**
   * 페이지당 항목 수
   * @default 20
   */
  pageSize: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : PAGINATION.DEFAULT_PAGE_SIZE))
    .pipe(z.number().int().positive().max(PAGINATION.MAX_PAGE_SIZE))
    .catch(PAGINATION.DEFAULT_PAGE_SIZE),

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
function extractPaginationParams(request: Request): PaginationParams {
  const { searchParams } = new URL(request.url);

  return paginationSchema.parse({
    page: searchParams.get('page') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
    sortBy: searchParams.get('sortBy') || undefined,
    sortOrder: searchParams.get('sortOrder') || undefined,
  });
}

/**
 * 리소스별 정렬 허용 필드.
 *
 * 목록 화면이 실제로 제공하는 정렬만 넣는다. 여기 없는 값은 조용히 무시되고 기본 정렬로
 * 떨어진다 — 400 을 돌려주면 링크를 공유하다 필드명이 바뀐 경우 화면이 깨지기만 한다.
 */
export const SORTABLE_FIELDS = {
  users: ['name', 'email', 'createdAt', 'updatedAt', 'isActive'],
  clients: ['name', 'code', 'createdAt', 'updatedAt', 'isActive'],
  srs: [
    'srNumber',
    'title',
    'status',
    'actualPriority',
    'requestedPriority',
    'dueDate',
    'completedAt',
    'createdAt',
    'updatedAt',
  ],
} as const;

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
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' = 'desc',
  allowedFields?: readonly string[]
): Array<Record<string, 'asc' | 'desc'>> {
  // allowlist 를 통과한 필드만 orderBy 로 나간다.
  //
  // 예전에는 `{ [sortBy]: sortOrder }` 를 검증 없이 만들었고 스키마도
  // `sortBy: z.string().optional()` 이었다(감사 4.1). 그래서
  //   - `/api/users?sortBy=password` 가 bcrypt 해시로 정렬하는 **순서 오라클**이 되고,
  //   - 존재하지 않는 컬럼은 Prisma 검증 오류로 500 + 스키마 유출이 됐다.
  //
  // allowlist 를 주지 않은 호출은 정렬을 무시한다 — 실수로 빠뜨린 호출이 예전처럼
  // 임의 컬럼을 통과시키는 것보다, 기본 정렬로 떨어지는 편이 안전하다.
  const field = sortBy && allowedFields?.includes(sortBy) ? sortBy : undefined;

  // tiebreaker 를 항상 붙인다. 정렬 키가 같은 행들의 순서가 정해지지 않으면
  // OFFSET 페이징에서 페이지 간 행 중복·누락이 생긴다.
  return field
    ? [{ [field]: sortOrder }, { id: sortOrder }]
    : [{ createdAt: 'desc' }, { id: 'desc' }];
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
export function usePagination(request: Request, allowedSortFields?: readonly string[]) {
  const params = extractPaginationParams(request);
  const { skip, take } = getPrismaSkipTake(params.page, params.pageSize);
  const orderBy = getPrismaOrderBy(params.sortBy, params.sortOrder, allowedSortFields);

  return {
    params,
    skip,
    take,
    orderBy,
    createResponse: <T>(data: T[], totalItems: number) =>
      createPaginatedResponse(data, params.page, params.pageSize, totalItems),
  };
}
