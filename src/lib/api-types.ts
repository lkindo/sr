/**
 * API Route 타입 정의
 *
 * Next.js 15의 동적 라우트 파라미터는 Promise를 반환합니다.
 * 이 파일은 API Route와 Page에서 사용할 공통 타입을 정의합니다.
 */

import { AuthenticatedSession } from "@/types/session";

/**
 * 라우트 컨텍스트 타입
 * Next.js 15에서 params는 Promise로 변경되었습니다.
 *
 * @template T params 객체의 타입
 */
export type RouteContext<T extends Record<string, string> = Record<string, string>> = {
  params: Promise<T>;
};

/**
 * 인증된 세션이 포함된 라우트 컨텍스트
 *
 * `withAuthAndRateLimit` 래퍼 사용 시 이 타입을 사용합니다.
 *
 * @template T params 객체의 타입
 */
export type RouteContextWithSession<T extends Record<string, string> = Record<string, string>> = {
  params: Promise<T>;
  session: AuthenticatedSession;
};

/**
 * 검색 파라미터 타입
 *
 * Next.js 15에서 searchParams도 Promise로 변경되었습니다.
 */
export type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * 페이지 Props 타입
 *
 * @template P params 타입
 * @template S searchParams 타입 (선택사항)
 */
export type PageProps<
  P extends Record<string, string> = Record<string, string>,
  S extends Record<string, string | string[] | undefined> = Record<string, string | string[] | undefined>
> = {
  params: Promise<P>;
  searchParams: Promise<S>;
};
