import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apiDelete,
  ApiError,
  apiGet,
  apiList,
  apiPatch,
  apiPost,
  apiPut,
  apiRequest,
  buildQuery,
  retryUnlessClientError,
} from '@/lib/api-client';

/**
 * `api-client` 는 컴포넌트 26개가 의존하는 단일 진입점이다. 여기가 틀리면 화면마다
 * 다르게 틀리므로, 계약을 문장 단위로 못박아 둔다.
 *
 * 특히 다음 셋은 실제 회귀 이력이 있거나 회귀하면 조용히 깨지는 것들이다:
 *   - FormData 에 Content-Type 을 붙이지 않는다(붙이면 multipart boundary 가 깨진다)
 *   - 에러 본문이 JSON 이 아니어도 던지는 것은 ApiError 여야 한다(파싱 실패가 원인을 가리면 안 된다)
 *   - 204/빈 본문에서 JSON.parse 를 시도하지 않는다
 */

/** 실제 fetch 응답에 가까운 최소 대역. api-client 는 status·ok·text 를 읽는다. */
function res(
  body: unknown,
  { status = 200, ok, text }: { status?: number; ok?: boolean; text?: string } = {}
): Response {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    text: async () => text ?? (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  } as Response;
}

/** 본문이 JSON 이 아닌 응답(프록시가 낸 502 HTML 등). */
function nonJsonRes(status: number, raw: string): Response {
  return {
    ok: false,
    status,
    text: async () => raw,
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** 실패를 기다렸다가 ApiError 로 좁혀 돌려준다. `catch((e) => e)` 는 unknown 이라 바로 못 읽는다. */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

/** 마지막 fetch 호출의 [url, init]. */
function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return call as [string, RequestInit];
}

describe('ApiError', () => {
  it('status·code·body 를 실어 나르고 name 이 ApiError 다', () => {
    const error = new ApiError(409, '진행 중인 SR 이 있습니다.', 'ONGOING_SRS', { count: 3 });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(409);
    expect(error.message).toBe('진행 중인 SR 이 있습니다.');
    expect(error.code).toBe('ONGOING_SRS');
    expect(error.body).toEqual({ count: 3 });
  });

  it('code 와 body 는 선택이다', () => {
    const error = new ApiError(500, '서버 오류');
    expect(error.code).toBeUndefined();
    expect(error.body).toBeUndefined();
  });
});

describe('retryUnlessClientError', () => {
  it.each([400, 401, 403, 404, 409, 422, 499])('%d 는 재시도하지 않는다', (status) => {
    expect(retryUnlessClientError(0, new ApiError(status, 'x'))).toBe(false);
  });

  it.each([500, 502, 503])('%d 는 1회까지 재시도한다', (status) => {
    expect(retryUnlessClientError(0, new ApiError(status, 'x'))).toBe(true);
    expect(retryUnlessClientError(1, new ApiError(status, 'x'))).toBe(false);
  });

  it('ApiError 가 아닌 오류(네트워크 등)는 1회까지 재시도한다', () => {
    expect(retryUnlessClientError(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retryUnlessClientError(1, new TypeError('Failed to fetch'))).toBe(false);
  });

  it('상태코드가 400 미만인 ApiError 는 4xx 취급하지 않는다', () => {
    // 방어적 경계. 3xx 를 ApiError 로 만드는 경로는 현재 없지만 조건식이 `>= 400` 임을 고정한다.
    expect(retryUnlessClientError(0, new ApiError(302, 'redirect'))).toBe(true);
  });
});

describe('apiRequest — 요청 조립', () => {
  it('객체 body 는 JSON 으로 직렬화하고 Content-Type 을 붙인다', async () => {
    fetchMock.mockResolvedValue(res({ ok: true }));

    await apiRequest('/api/x', { method: 'POST', body: { a: 1 } });

    const [url, init] = lastCall();
    expect(url).toBe('/api/x');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('문자열 body 는 그대로 보내되 Content-Type 은 붙인다', async () => {
    fetchMock.mockResolvedValue(res({}));

    await apiRequest('/api/x', { method: 'POST', body: '{"raw":true}' });

    const [, init] = lastCall();
    expect(init.body).toBe('{"raw":true}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('⚠️ FormData 에는 Content-Type 을 절대 붙이지 않는다', async () => {
    // 붙이면 브라우저가 multipart boundary 를 계산하지 못해 서버가 본문을 파싱하지 못한다.
    // 첨부 업로드 3곳이 이 동작에 의존한다.
    fetchMock.mockResolvedValue(res({}));
    const formData = new FormData();
    formData.append('file', new Blob(['x']), 'a.txt');

    await apiRequest('/api/attachments', { method: 'POST', body: formData });

    const [, init] = lastCall();
    expect(init.body).toBe(formData);
    expect(new Headers(init.headers).get('Content-Type')).toBeNull();
  });

  it('호출자가 준 Content-Type 은 덮어쓰지 않는다', async () => {
    fetchMock.mockResolvedValue(res({}));

    await apiRequest('/api/x', {
      method: 'POST',
      body: { a: 1 },
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });

    expect(new Headers(lastCall()[1].headers).get('Content-Type')).toBe(
      'application/merge-patch+json'
    );
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('body 가 %s 면 본문 없이 보낸다', async (_label, body) => {
    fetchMock.mockResolvedValue(res({}));

    await apiRequest('/api/x', { method: 'DELETE', body });

    expect(lastCall()[1].body).toBeUndefined();
  });

  it('signal 등 나머지 RequestInit 은 그대로 전달한다', async () => {
    fetchMock.mockResolvedValue(res({}));
    const controller = new AbortController();

    await apiRequest('/api/x', { signal: controller.signal });

    expect(lastCall()[1].signal).toBe(controller.signal);
  });
});

describe('apiRequest — 성공 응답 파싱', () => {
  it('JSON 본문을 파싱해 돌려준다', async () => {
    fetchMock.mockResolvedValue(res({ id: 'c-1', name: '고객사' }));

    await expect(apiGet('/api/clients/c-1')).resolves.toEqual({ id: 'c-1', name: '고객사' });
  });

  it('204 는 본문을 읽지 않고 undefined 를 돌려준다', async () => {
    const response = res(undefined, { status: 204 });
    const textSpy = vi.spyOn(response, 'text');
    fetchMock.mockResolvedValue(response);

    await expect(apiDelete('/api/x')).resolves.toBeUndefined();
    expect(textSpy).not.toHaveBeenCalled();
  });

  it('200 이지만 본문이 비어 있으면 undefined 다 (JSON.parse 를 시도하지 않는다)', async () => {
    fetchMock.mockResolvedValue(res(undefined, { status: 200, text: '' }));

    await expect(apiDelete('/api/x')).resolves.toBeUndefined();
  });
});

describe('apiRequest — 실패는 항상 ApiError', () => {
  it('본문의 error 키를 메시지로 쓴다', async () => {
    fetchMock.mockResolvedValue(res({ error: '권한이 없습니다.' }, { status: 403 }));

    await expect(apiGet('/api/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: '권한이 없습니다.',
    });
  });

  it('error 가 없으면 message 키를 쓴다', async () => {
    fetchMock.mockResolvedValue(res({ message: '잘못된 요청' }, { status: 400 }));

    await expect(apiGet('/api/x')).rejects.toMatchObject({ message: '잘못된 요청' });
  });

  it('error 가 빈 문자열이면 message 로 넘어간다', async () => {
    fetchMock.mockResolvedValue(res({ error: '', message: '대체 문구' }, { status: 400 }));

    await expect(apiGet('/api/x')).rejects.toMatchObject({ message: '대체 문구' });
  });

  it('둘 다 없으면 fallbackMessage 를 쓴다', async () => {
    fetchMock.mockResolvedValue(res({ somethingElse: 1 }, { status: 500 }));

    await expect(apiGet('/api/x', { fallbackMessage: '조회 실패' })).rejects.toMatchObject({
      message: '조회 실패',
    });
  });

  it('fallbackMessage 도 없으면 기본 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(res({}, { status: 500 }));

    await expect(apiGet('/api/x')).rejects.toMatchObject({
      message: '요청을 처리하지 못했습니다.',
    });
  });

  it('본문이 문자열/배열이면 메시지 추출을 건너뛴다', async () => {
    fetchMock.mockResolvedValue(res('그냥 문자열', { status: 400 }));

    await expect(apiGet('/api/x', { fallbackMessage: 'fb' })).rejects.toMatchObject({
      message: 'fb',
    });
  });

  it('본문이 JSON 이 아니어도 ApiError 를 던진다 (파싱 실패가 원인을 가리지 않는다)', async () => {
    // nginx 가 낸 429, 프록시가 낸 502 HTML 이 이 경로다.
    fetchMock.mockResolvedValue(nonJsonRes(502, '<html>Bad Gateway</html>'));

    const error = await expectApiError(apiGet('/api/x', { fallbackMessage: '게이트웨이 오류' }));

    expect(error.status).toBe(502);
    expect(error.message).toBe('게이트웨이 오류');
    expect(error.body).toBeUndefined();
  });

  it('code 를 실어 409 강제 재시도 플로우가 판정할 수 있게 한다', async () => {
    fetchMock.mockResolvedValue(
      res({ error: '진행 중인 SR', code: 'ONGOING_SRS', data: { n: 2 } }, { status: 409 })
    );

    const error = await expectApiError(apiPatch('/api/users/u-1/client', {}));

    expect(error.status).toBe(409);
    expect(error.code).toBe('ONGOING_SRS');
    expect(error.body).toEqual({ error: '진행 중인 SR', code: 'ONGOING_SRS', data: { n: 2 } });
  });

  it('code 가 문자열이 아니면 undefined 다', async () => {
    fetchMock.mockResolvedValue(res({ error: 'x', code: 42 }, { status: 400 }));

    const error = await expectApiError(apiGet('/api/x'));
    expect(error.code).toBeUndefined();
  });
});

describe('메서드 헬퍼', () => {
  it.each([
    ['apiGet', apiGet, 'GET'],
    ['apiDelete', apiDelete, 'DELETE'],
  ] as const)('%s 는 %s 로 보낸다', async (_name, fn, method) => {
    fetchMock.mockResolvedValue(res({}));
    await fn('/api/x');
    expect(lastCall()[1].method).toBe(method);
  });

  it.each([
    ['apiPost', apiPost, 'POST'],
    ['apiPatch', apiPatch, 'PATCH'],
    ['apiPut', apiPut, 'PUT'],
  ] as const)('%s 는 %s 로 body 와 함께 보낸다', async (_name, fn, method) => {
    fetchMock.mockResolvedValue(res({}));
    await fn('/api/x', { a: 1 });
    const [, init] = lastCall();
    expect(init.method).toBe(method);
    expect(init.body).toBe('{"a":1}');
  });
});

describe('apiList — 봉투 처리', () => {
  it('{data, meta} 봉투는 통째로 돌려준다 (meta 를 벗기면 페이저를 못 그린다)', async () => {
    const meta = {
      currentPage: 2,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    };
    fetchMock.mockResolvedValue(res({ data: [{ id: 'a' }], meta }));

    await expect(apiList('/api/clients?page=2')).resolves.toEqual({ data: [{ id: 'a' }], meta });
  });

  it('bare 배열을 주는 예외 라우트도 받아 meta 를 합성한다', async () => {
    // /api/roles, /api/permissions, /api/service-categories 가 이 형태다.
    // 호출부 4곳에 중복돼 있던 `Array.isArray(r) ? r : r.data || []` 를 여기로 흡수한 것이다.
    fetchMock.mockResolvedValue(res([{ id: 'r1' }, { id: 'r2' }]));

    await expect(apiList('/api/roles')).resolves.toEqual({
      data: [{ id: 'r1' }, { id: 'r2' }],
      meta: {
        currentPage: 1,
        pageSize: 2,
        totalItems: 2,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
  });

  it('빈 배열도 합성 meta 로 돌려준다', async () => {
    fetchMock.mockResolvedValue(res([]));

    const result = await apiList('/api/roles');
    expect(result.data).toEqual([]);
    expect(result.meta.totalItems).toBe(0);
    expect(result.meta.hasNextPage).toBe(false);
  });

  it('GET 으로 보낸다', async () => {
    fetchMock.mockResolvedValue(res([]));
    await apiList('/api/roles');
    expect(lastCall()[1].method).toBe('GET');
  });
});

describe('buildQuery', () => {
  it('값이 있는 키만 넣는다', () => {
    expect(buildQuery({ page: 2, search: '가나', isActive: true })).toBe(
      '?page=2&search=%EA%B0%80%EB%82%98&isActive=true'
    );
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['빈 문자열', ''],
  ])('%s 인 키는 URL 에 넣지 않는다', (_label, value) => {
    // 빈 값이 `?search=` 로 남으면 서버가 "빈 문자열로 검색" 으로 해석할 수 있다.
    expect(buildQuery({ search: value, page: 1 })).toBe('?page=1');
  });

  it('false 와 0 은 유효한 값이므로 넣는다', () => {
    expect(buildQuery({ isActive: false, page: 0 })).toBe('?isActive=false&page=0');
  });

  it('모든 값이 비면 빈 문자열을 돌려준다 (물음표만 남기지 않는다)', () => {
    expect(buildQuery({ a: undefined, b: null, c: '' })).toBe('');
  });

  it('빈 객체도 빈 문자열이다', () => {
    expect(buildQuery({})).toBe('');
  });
});
