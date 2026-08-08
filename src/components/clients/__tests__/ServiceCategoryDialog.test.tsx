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

const okFetch = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({}) }))
  );

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
    render(<ServiceCategoryDialog {...baseProps} />);

    // SLA 기본값이 비어 있으면 사용자가 매번 직접 채워야 한다.
    expect((document.getElementById('slaHours') as HTMLInputElement).value).toBe('24');
  });

  it('category 가 있으면 기존 값을 채운다', () => {
    render(<ServiceCategoryDialog {...baseProps} category={CATEGORY} />);

    expect((document.getElementById('categoryName') as HTMLInputElement).value).toBe('장애 대응');
    expect((document.getElementById('slaHours') as HTMLInputElement).value).toBe('8');
  });

  it('닫혀 있으면 렌더하지 않는다', () => {
    render(<ServiceCategoryDialog {...baseProps} open={false} />);

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
    render(<ServiceCategoryDialog {...baseProps} />);

    submitBypassingHtmlValidation();

    await expectBlocked(/카테고리명/);
  });

  // 공백만 넣은 이름은 목록에서 빈 줄로 보인다.
  it('공백만 있는 이름도 막는다', async () => {
    render(<ServiceCategoryDialog {...baseProps} />);
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
    render(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');
    fill('slaHours', value);

    submitBypassingHtmlValidation();

    await expectBlocked(/SLA/);
  });
});

describe('ServiceCategoryDialog — 저장', () => {
  it('생성은 고객사 하위 경로로 POST 한다', async () => {
    render(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().url).toBe('/api/clients/c-1/categories');
    expect(sent().method).toBe('POST');
    expect(sent().body).toMatchObject({ categoryName: '장애 대응', slaHours: 24 });
  });

  it('수정은 카테고리 id 까지 붙여 PATCH 한다', async () => {
    render(<ServiceCategoryDialog {...baseProps} category={CATEGORY} />);
    fill('categoryName', '이름 변경');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().url).toBe('/api/clients/c-1/categories/cat-1');
    expect(sent().method).toBe('PATCH');
  });

  it('이름 앞뒤 공백은 잘라서 보낸다', async () => {
    render(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '  장애 대응  ');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().body.categoryName).toBe('장애 대응');
  });

  it('설명이 비면 아예 보내지 않는다', async () => {
    render(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // 빈 문자열을 보내면 서버가 그것으로 덮어써 기존 설명이 지워진다.
    expect(sent().body.description).toBeUndefined();
  });

  it('SLA 를 숫자로 변환해 보낸다', async () => {
    render(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');
    fill('slaHours', '48');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // 문자열로 보내면 서버 스키마가 거절한다.
    expect(sent().body.slaHours).toBe(48);
  });

  it('성공하면 onSaved 를 부른다', async () => {
    const onSaved = vi.fn();
    render(<ServiceCategoryDialog {...baseProps} onSaved={onSaved} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe('ServiceCategoryDialog — 실패 처리', () => {
  it('서버가 거절하면 그 사유를 보여 준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: '같은 이름의 카테고리가 이미 있습니다.' }),
      }))
    );
    const onSaved = vi.fn();
    render(<ServiceCategoryDialog {...baseProps} onSaved={onSaved} />);
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      }))
    );
    render(<ServiceCategoryDialog {...baseProps} />);
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
    render(<ServiceCategoryDialog {...baseProps} />);
    fill('categoryName', '장애 대응');

    submit();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /추가|수정/ })).not.toBeDisabled()
    );
  });
});
