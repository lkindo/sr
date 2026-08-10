import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToast } from '@/hooks/use-toast';

import { ServiceCategoryDialog } from '../ServiceCategoryDialog';

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

/**
 * 서비스 카테고리 생성·편집 다이얼로그.
 *
 * 이 화면이 없던 시절 신규 고객사는 카테고리가 0개라 **SR 을 한 건도 받을 수 없었다**
 * (SR 생성 폼이 카테고리를 하드 요구한다). 백엔드는 있었는데 부르는 곳이 없어 유일한
 * 해결책이 수동 DB insert 였다(감사 3.18). 그래서 이 컴포넌트는 "있으면 좋은 UI" 가
 * 아니라 고객사 온보딩의 필수 경로다.
 *
 * 검증에서 중요한 것은 **SLA 시간**이다. 이 값은 SR 의 마감일 계산에 직접 들어가므로
 * 0 이나 소수가 들어가면 마감일이 즉시 지났거나 엉뚱한 시각이 된다. 서버도 막지만
 * 여기서 먼저 걸러야 사용자가 이유를 안다.
 *
 * 그리고 `clientId` 는 **prop 으로 받은 값**만 쓴다. 라우트도 URL 의 id 만 신뢰하므로
 * (본문 값은 무시한다) 양쪽이 같은 규칙이어야 경로가 어긋나지 않는다.
 *
 * 저장이 React Query 로 옮겨졌으므로 렌더는 `QueryClientProvider` 를 요구한다. 단언은
 * 그대로다 — `fetch` 스텁의 호출 인자(url·method·body)를 보는 방식이 유효한 것은
 * `apiPost`/`apiPatch` 가 결국 같은 인자로 `fetch` 를 부르기 때문이다.
 */

const toast = vi.fn();

const CATEGORY = {
  id: 'cat-1',
  categoryName: '장애 대응',
  description: '기존 설명',
  slaHours: 8,
  priority: 'HIGH',
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  clientId: 'c-1',
  category: null,
  onSaved: vi.fn(),
};

const fill = (id: string, value: string) =>
  fireEvent.change(document.getElementById(id)!, { target: { value } });

/**
 * 제출 버튼 라벨은 모드에 따라 다르다 — 생성은 '추가', 수정은 '수정'.
 * (진행 중에는 '저장 중...' 이 된다.)
 */
const submit = () => fireEvent.click(screen.getByRole('button', { name: /추가|수정/ }));

/**
 * 실제 `Response` 를 돌려준다.
 *
 * 손으로 만든 `{ ok, json }` 리터럴로는 부족하다 — `api-client` 는 성공 응답에서 `status`
 * (204 판별)와 `text()`(빈 본문 허용)를 함께 읽기 때문이다. 대역이 진짜 계약보다 좁으면
 * 컴포넌트가 아니라 대역이 통과 여부를 정하게 된다.
 */
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stubFetch = (respond: () => Response | Promise<Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => respond())
  );

const okFetch = () => stubFetch(() => jsonResponse({}));

/**
 * 저장 mutation 하나뿐이라 조회 옵션은 쓰이지 않지만, 저장소의 다이얼로그 테스트 관례를
 * 그대로 따른다(`retry: false` / `gcTime: 0`). 재시도가 켜져 있으면 실패 케이스가
 * 백오프 때문에 늘어진다.
 */
const renderDialog = (ui: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
};

/** 마지막 요청의 URL·메서드·본문. */
const sent = () => {
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  return { url, method: init!.method, body: JSON.parse(init!.body as string) };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useToast).mockReturnValue({ toast } as never);
  okFetch();
});

describe('ServiceCategoryDialog — 모드', () => {
  it('category 가 없으면 기본값으로 연다', () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} />);

    // SLA 기본값이 비어 있으면 사용자가 매번 직접 채워야 한다.
    expect((document.getElementById('slaHours') as HTMLInputElement).value).toBe('24');
  });

  it('category 가 있으면 기존 값을 채운다', () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} category={CATEGORY} />);

    expect((document.getElementById('categoryName') as HTMLInputElement).value).toBe('장애 대응');
    expect((document.getElementById('slaHours') as HTMLInputElement).value).toBe('8');
  });

  it('닫혀 있으면 렌더하지 않는다', () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} open={false} />);

    expect(screen.queryByRole('button', { name: /추가|수정/ })).not.toBeInTheDocument();
  });
});

/**
 * 아래 검증 테스트는 버튼 클릭 대신 form 의 submit 이벤트를 직접 쏜다.
 *
 * 입력에 `required` / `min=1` / `step=1` 이 걸려 있어 브라우저(그리고 jsdom)의 제약
 * 검증이 먼저 막아 버리기 때문이다. 그러면 **핸들러 안의 JS 검증까지 도달하지 못해**
 * 아무것도 확인하지 못한다.
 *
 * 그 JS 검증은 장식이 아니라 두 번째 방어선이다. HTML 제약은 devtools 로 속성을 지우거나
 * novalidate 를 붙이면 그대로 우회되고, 그때 네트워크로 나가는 것을 막는 것은 이 코드뿐이다.
 * 소스 주석도 그 의도를 명시한다 — "서버가 거절하기 전에 여기서 걸러 준다".
 */
const submitBypassingHtmlValidation = () => fireEvent.submit(document.querySelector('form')!);

describe('ServiceCategoryDialog — 검증', () => {
  const expectBlocked = async (message: string | RegExp) => {
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: expect.stringMatching(message),
        })
      )
    );
    expect(fetch).not.toHaveBeenCalled();
  };

  it('카테고리명이 비면 보내지 않는다', async () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} />);

    submitBypassingHtmlValidation();

    await expectBlocked(/카테고리명/);
  });

  // 공백만 넣은 이름은 목록에서 빈 줄로 보인다.
  it('공백만 있는 이름도 막는다', async () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '   ');

    submitBypassingHtmlValidation();

    await expectBlocked(/카테고리명/);
  });

  // SLA 는 마감일 계산에 직접 들어간다. 0 이면 생성 즉시 지연 상태가 된다.
  it.each([
    ['0', '0'],
    ['음수', '-1'],
    ['소수', '1.5'],
    ['숫자 아님', 'abc'],
  ])('SLA 가 %s 이면 막는다', async (_label, value) => {
    renderDialog(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');
    fill('slaHours', value);

    submitBypassingHtmlValidation();

    await expectBlocked(/SLA/);
  });
});

describe('ServiceCategoryDialog — 저장', () => {
  it('생성은 고객사 하위 경로로 POST 한다', async () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().url).toBe('/api/clients/c-1/categories');
    expect(sent().method).toBe('POST');
    expect(sent().body).toMatchObject({ categoryName: '장애 대응', slaHours: 24 });
  });

  it('수정은 카테고리 id 까지 붙여 PATCH 한다', async () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} category={CATEGORY} />);
    fill('categoryName', '이름 변경');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().url).toBe('/api/clients/c-1/categories/cat-1');
    expect(sent().method).toBe('PATCH');
  });

  it('이름 앞뒤 공백은 잘라서 보낸다', async () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '  장애 대응  ');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().body.categoryName).toBe('장애 대응');
  });

  it('설명이 비면 아예 보내지 않는다', async () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // 빈 문자열을 보내면 서버가 그것으로 덮어써 기존 설명이 지워진다.
    expect(sent().body.description).toBeUndefined();
  });

  it('SLA 를 숫자로 변환해 보낸다', async () => {
    renderDialog(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');
    fill('slaHours', '48');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // 문자열로 보내면 서버 스키마가 거절한다.
    expect(sent().body.slaHours).toBe(48);
  });

  it('성공하면 onSaved 를 부른다', async () => {
    const onSaved = vi.fn();
    renderDialog(<ServiceCategoryDialog {...baseProps} onSaved={onSaved} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe('ServiceCategoryDialog — 실패 처리', () => {
  it('서버가 거절하면 그 사유를 보여 준다', async () => {
    // 4xx 로 만든다 — 저장은 재시도하지 않지만, 실패 응답의 의미도 "고쳐서 다시 보내라" 다.
    stubFetch(() => jsonResponse({ error: '같은 이름의 카테고리가 이미 있습니다.' }, 409));
    const onSaved = vi.fn();
    renderDialog(<ServiceCategoryDialog {...baseProps} onSaved={onSaved} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: '같은 이름의 카테고리가 이미 있습니다.',
        })
      )
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  // 502 처럼 본문이 JSON 이 아닐 때 파싱에서 죽으면 원래 오류가 가려진다.
  it('에러 본문이 JSON 이 아니어도 안내한다', async () => {
    stubFetch(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    renderDialog(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: '저장에 실패했습니다.' })
      )
    );
  });

  it('네트워크가 끊겨도 저장 버튼이 다시 눌린다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network error');
      })
    );
    renderDialog(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /추가|수정/ })).not.toBeDisabled()
    );
  });
});
