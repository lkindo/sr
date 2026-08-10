/**
 * 브라우저에서 내부 API 를 부르는 단일 진입점.
 *
 * ── 왜 만들었나 ─────────────────────────────────────────────────────────────
 * 컴포넌트 50곳이 각자 `fetch` 를 부르며 **같은 일을 조금씩 다르게** 하고 있었다.
 *
 *   1. **에러 언랩이 제각각이었다.** 어떤 곳은 `error.error`, 어떤 곳은 `error.message`,
 *      어떤 곳은 `response.statusText`, 어떤 곳은 아무것도 읽지 않고 고정 문구를 던졌다.
 *   2. **상태코드를 실은 에러 타입이 저장소에 없었다.** 그래서 "403 은 권한 없음 화면,
 *      404 는 notFound(), 나머지는 토스트" 같은 분기를 하려면 매번 `response.status` 를
 *      호출부까지 손으로 들고 내려가야 했다. React Query 로 옮기면 그 값이 `error` 안에
 *      들어 있어야 하는데, 담을 그릇이 없었다.
 *   3. **`Array.isArray(result) ? result : result.data || []` 삼항식이 4곳에 중복**돼 있었다.
 *      목록 라우트는 `{data, meta}` 봉투를 쓰지만 `/api/roles`·`/api/permissions`·
 *      `/api/service-categories`·`/api/clients/[id]` 네 곳은 bare 를 돌려주기 때문이다
 *      (규약과 예외 모두 src/lib/pagination.ts 상단에 문서화돼 있다).
 *
 * ── 계약 ────────────────────────────────────────────────────────────────────
 * - 실패는 **항상 `ApiError` 를 throw** 한다. React Query 의 `error` 로 그대로 흘러간다.
 * - 성공 본문은 파싱해서 그대로 돌려준다. 봉투를 벗기는 것은 `apiList` 만 한다.
 * - `AbortError` 는 그대로 통과시킨다 — React Query 가 취소를 그 이름으로 식별한다.
 *
 * ⚠️ **body 가 FormData 면 Content-Type 을 절대 붙이지 않는다.** multipart 는 브라우저가
 *    boundary 를 계산해 붙여야 하며, 우리가 `application/json` 을 넣는 순간 서버가 본문을
 *    파싱하지 못한다. 첨부 업로드 3곳이 이 동작에 의존한다.
 */

import type { PaginatedResponse } from '@/lib/pagination';

/**
 * HTTP 상태코드를 실어 나르는 에러.
 *
 * `instanceof ApiError` 로 좁힌 뒤 `status` 를 보고 분기한다. 이 타입이 없으면
 * "403 이면 권한 없음 화면" 같은 계약을 React Query 의 `error` 만으로 표현할 수 없다.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** 서버가 함께 내려준 기계 판독용 코드. 예: 409 의 `ONGOING_SRS`. */
    public readonly code?: string,
    /** 파싱된 에러 본문 전체. 라우트마다 추가 필드가 달라 그대로 보관한다. */
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 재시도해도 결과가 달라지지 않는 에러인지.
 *
 * React Query 의 전역 기본값은 `retry: 1` 이다. 그대로 두면 403(권한 없음)과
 * 404(없는 대상)도 한 번 더 조회한다 — 사용자를 기다리게 만들 뿐 결과는 같다.
 * 목록·상세 쿼리에 `retry: retryUnlessClientError` 를 주면 5xx 와 네트워크 오류만
 * 재시도한다.
 */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

/** 에러 본문에서 사람이 읽을 메시지를 뽑는다. 라우트마다 키가 달라 순서대로 시도한다. */
function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['error', 'message'] as const) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return fallback;
}

/** 에러 본문의 기계 판독용 코드. 409 강제 재시도 플로우가 이 값을 읽는다. */
function extractCode(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const value = (body as Record<string, unknown>).code;
    if (typeof value === 'string') return value;
  }
  return undefined;
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  /** 객체면 JSON 으로 직렬화한다. FormData 면 그대로 보내고 Content-Type 을 붙이지 않는다. */
  body?: unknown;
  /** 실패 시 서버가 메시지를 주지 않았을 때 쓸 문구. */
  fallbackMessage?: string;
}

/**
 * 모든 요청이 지나는 지점. 성공하면 파싱된 본문을, 실패하면 `ApiError` 를 던진다.
 */
export async function apiRequest<T>(url: string, init: ApiRequestInit = {}): Promise<T> {
  const { body, fallbackMessage, headers, ...rest } = init;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const requestHeaders = new Headers(headers);

  let requestBody: BodyInit | undefined;
  if (body === undefined || body === null) {
    requestBody = undefined;
  } else if (isFormData) {
    // Content-Type 을 붙이지 않는다. 위 파일 주석의 ⚠️ 참조.
    requestBody = body as FormData;
  } else if (typeof body === 'string') {
    requestBody = body;
    if (!requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }
  } else {
    requestBody = JSON.stringify(body);
    if (!requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }
  }

  const response = await fetch(url, { ...rest, headers: requestHeaders, body: requestBody });

  if (!response.ok) {
    // 에러 본문이 JSON 이 아닐 수 있다(프록시가 낸 502 HTML, nginx 가 낸 429 등).
    // 파싱 실패가 원래 에러를 가리지 않도록 삼킨다.
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    throw new ApiError(
      response.status,
      extractMessage(parsed, fallbackMessage ?? '요청을 처리하지 못했습니다.'),
      extractCode(parsed),
      parsed
    );
  }

  // 204 No Content 와 빈 본문을 허용한다. `{ success: true }` 만 돌려주는 변이 라우트도
  // 있고, 아예 본문이 없는 것도 있다.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (text.length === 0) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * 단건/bare 응답 조회.
 *
 * 목록 봉투를 벗기지 않는다 — `/api/roles` 처럼 bare 배열을 주는 라우트가 있어서
 * 무조건 `.data` 를 읽으면 `undefined` 가 된다.
 */
export function apiGet<T>(url: string, init?: ApiRequestInit): Promise<T> {
  return apiRequest<T>(url, { ...init, method: 'GET' });
}

/**
 * 목록 응답 조회.
 *
 * `{ data, meta }` 봉투를 **통째로** 돌려준다. 페이지네이션 UI 가 `meta` 를 필요로 하므로
 * `data` 만 벗기면 안 된다.
 *
 * bare 배열을 주는 예외 라우트(`/api/roles` 등)도 받아 준다 — 호출부 4곳에 중복돼 있던
 * `Array.isArray(result) ? result : result.data || []` 를 여기로 흡수한 것이다.
 * 그 경우 `meta` 는 전체를 한 페이지로 본 값으로 합성한다.
 */
export async function apiList<T>(
  url: string,
  init?: ApiRequestInit
): Promise<PaginatedResponse<T>> {
  const payload = await apiRequest<PaginatedResponse<T> | T[]>(url, { ...init, method: 'GET' });

  if (Array.isArray(payload)) {
    return {
      data: payload,
      meta: {
        currentPage: 1,
        pageSize: payload.length,
        totalItems: payload.length,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    };
  }

  return payload;
}

/** 변이 공통. 메서드만 다르고 나머지는 `apiRequest` 와 같다. */
export function apiPost<T>(url: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  return apiRequest<T>(url, { ...init, method: 'POST', body });
}

export function apiPatch<T>(url: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  return apiRequest<T>(url, { ...init, method: 'PATCH', body });
}

export function apiPut<T>(url: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  return apiRequest<T>(url, { ...init, method: 'PUT', body });
}

export function apiDelete<T>(url: string, init?: ApiRequestInit): Promise<T> {
  return apiRequest<T>(url, { ...init, method: 'DELETE' });
}

/**
 * 쿼리스트링 조립.
 *
 * `undefined`·`null`·빈 문자열은 **키 자체를 넣지 않는다**. 이 규칙이 중요한 이유는
 * queryKey 와 URL 이 같은 파라미터 객체에서 파생되기 때문이다 — 빈 값이 `?search=` 로
 * 남으면 서버가 "빈 문자열로 검색" 으로 해석할 수 있다.
 */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs.length > 0 ? `?${qs}` : '';
}
