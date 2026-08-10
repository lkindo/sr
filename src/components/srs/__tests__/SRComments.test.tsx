import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSRCommentsInfinite } from '@/hooks/use-sr-infinite';
import { qk } from '@/lib/query-keys';

import { SRComments } from '../SRComments';

/**
 * SR 댓글 패널.
 *
 * ⚠️ 예전 이 파일은 `vi.mock('@tanstack/react-query', () => ({ useQueryClient: vi.fn() }))`
 *    로 라이브러리 전체를 **한 함수짜리 모듈**로 갈아치우고 있었다. 그때는 컴포넌트가
 *    `useQueryClient` 만 쓰고 조회는 `useSRCommentsInfinite` 목이 대신했기 때문에
 *    통과했지만, 쓰기가 `useMutation` 으로 옮겨오는 순간 `useMutation is not a function`
 *    으로 죽는 위장된 초록불이었다. 그래서 **실물 QueryClientProvider** 로 바꿨다.
 *    조회 훅만 목으로 남긴다 — 서버 액션을 부르기 때문이다.
 */

vi.mock('@/hooks/use-sr-infinite', () => ({
  useSRCommentsInfinite: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

/** 캐시를 직접 들여다봐야 해서 QueryClient 를 밖으로 꺼낸다. */
function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

/** 조회 훅의 반환값. 화면이 읽는 필드만 채운다. */
const listed = (comments: unknown[]) =>
  vi.mocked(useSRCommentsInfinite).mockReturnValue({
    isLoading: false,
    data: { pages: [{ comments }] },
    hasNextPage: false,
  } as never);

const okFetch = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: 'c-new' }),
    }))
  );

/**
 * 실패는 **4xx 로 만든다.** `api-client` 의 재시도 정책은 5xx 만 한 번 더 부르는데,
 * 그 백오프가 `waitFor` 를 늘어지게 한다(변이는 기본 재시도가 없지만, 실패 코드를
 * 4xx 로 통일해 두면 나중에 재시도가 붙어도 이 테스트가 느려지지 않는다).
 */
const failFetch = (message: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: message }),
    }))
  );

const write = (value: string) =>
  fireEvent.change(screen.getByLabelText('댓글 작성'), { target: { value } });

const submit = () => fireEvent.click(screen.getByRole('button', { name: /댓글 추가|추가 중/ }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue(router as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SRComments — 렌더', () => {
  it('renders loading state initially', () => {
    vi.mocked(useSRCommentsInfinite).mockReturnValue({
      isLoading: true,
      data: null,
    } as never);

    const { wrapper } = setup();
    render(<SRComments srId="test-sr-id" />, { wrapper });

    // 로딩 표시는 시각 요소(스피너)뿐 아니라 스크린리더에도 알려야 한다.
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('댓글을 불러오는 중')).toBeInTheDocument();
  });

  it('renders comments list with correct semantics', () => {
    listed([
      {
        id: 'c1',
        content: 'Test comment 1',
        createdAt: new Date().toISOString(),
        user: { name: 'User 1', image: null },
      },
      {
        id: 'c2',
        content: 'Test comment 2',
        createdAt: new Date().toISOString(),
        user: { name: 'User 2', image: null },
      },
    ]);

    const { wrapper } = setup();
    render(<SRComments srId="test-sr-id" />, { wrapper });

    // Check if list is rendered as a list
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();

    // Check if list items are rendered
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(2);
    expect(listItems[0]).toHaveTextContent('Test comment 1');
    expect(listItems[1]).toHaveTextContent('Test comment 2');
  });

  it('renders textarea with accessible name', () => {
    listed([]);

    const { wrapper } = setup();
    render(<SRComments srId="test-sr-id" />, { wrapper });

    // Check if textarea has accessible name
    const textarea = screen.getByLabelText('댓글 작성');
    expect(textarea).toBeInTheDocument();
  });

  it('renders empty state correctly', () => {
    listed([]);

    const { wrapper } = setup();
    render(<SRComments srId="test-sr-id" />, { wrapper });

    expect(screen.getByText('아직 댓글이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('첫 번째 댓글을 남겨보세요.')).toBeInTheDocument();
  });
});

describe('SRComments — 작성', () => {
  beforeEach(() => {
    listed([]);
  });

  it('내용이 비어 있으면 서버를 부르지 않는다', () => {
    okFetch();
    const { wrapper } = setup();
    render(<SRComments srId="test-sr-id" />, { wrapper });

    submit();

    expect(fetch).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '오류', description: '댓글 내용을 입력해주세요.' })
    );
  });

  it('공백만 입력해도 막는다', () => {
    okFetch();
    const { wrapper } = setup();
    render(<SRComments srId="test-sr-id" />, { wrapper });

    write('   ');
    submit();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('POST 로 보내고, 입력을 비우고, 댓글 캐시를 무효화한다', async () => {
    okFetch();
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<SRComments srId="test-sr-id" />, { wrapper });

    write('확인했습니다');
    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '성공', description: '댓글이 추가되었습니다.' })
      )
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/srs/test-sr-id/comments');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ content: '확인했습니다' });

    // 성공하면 입력이 비워져야 다음 댓글을 바로 쓸 수 있다.
    expect((screen.getByLabelText('댓글 작성') as HTMLTextAreaElement).value).toBe('');

    // 키를 손으로 적으면 조회하는 쪽과 어긋난다 — 팩토리가 낸 값과 같아야 한다.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.sr.comments('test-sr-id') });
    // 서버 컴포넌트가 그리는 부분도 함께 갱신한다.
    expect(router.refresh).toHaveBeenCalled();
  });

  /**
   * 실패했는데 입력이 지워지면 사용자가 방금 쓴 글을 잃는다. 이 화면에서 가장
   * 비싼 실패 양식이라 성공 경로보다 촘촘히 단언한다.
   */
  it('실패하면 서버 메시지를 띄우고 입력을 그대로 둔다', async () => {
    failFetch('이 SR 에 댓글을 달 권한이 없습니다.');
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<SRComments srId="test-sr-id" />, { wrapper });

    write('실패할 댓글');
    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '오류',
          description: '이 SR 에 댓글을 달 권한이 없습니다.',
          variant: 'destructive',
        })
      )
    );

    expect((screen.getByLabelText('댓글 작성') as HTMLTextAreaElement).value).toBe('실패할 댓글');
    expect(invalidate).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    // 다시 시도할 수 있어야 한다.
    expect(screen.getByRole('button', { name: '댓글 추가' })).not.toBeDisabled();
  });

  it('전송 중에는 입력과 버튼을 잠근다', async () => {
    // 응답을 붙잡아 두고 진행 중 상태만 관찰한다.
    let release!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      )
    );

    const { wrapper } = setup();
    render(<SRComments srId="test-sr-id" />, { wrapper });

    write('처리 중');
    submit();

    await waitFor(() => expect(screen.getByRole('button', { name: '추가 중...' })).toBeDisabled());
    expect(screen.getByLabelText('댓글 작성')).toBeDisabled();

    release({ ok: true, status: 201, text: async () => '{}' });
    await waitFor(() => expect(screen.getByRole('button', { name: '댓글 추가' })).toBeEnabled());
  });
});
