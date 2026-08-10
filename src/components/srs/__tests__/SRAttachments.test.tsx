import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SRAttachmentView } from '@/types/sr.types';

import { SRAttachments } from '../SRAttachments';

/**
 * 첨부 카드가 React Query 로 옮겨진 뒤에도 **화면에 보이는 계약**이 같은지 본다.
 *
 * 이 카드에서 회귀가 나면 조용하다는 것이 핵심이다:
 *  - 업로드는 이 저장소에서 유일하게 컴포넌트가 직접 **FormData** 를 보내는 경로다.
 *    `Content-Type` 이 붙는 순간 서버가 multipart 본문을 파싱하지 못하는데, 화면에는
 *    "업로드 실패" 토스트만 뜬다. 그래서 헤더 부재를 직접 단언한다.
 *  - 10MB 검증은 **요청을 보내기 전에** 끝나야 한다. 변이 안으로 들어가면 서버 왕복 없이도
 *    버튼이 '업로드 중...' 으로 깜빡인다.
 *  - 업로드·삭제 뒤에는 반드시 재조회가 뒤따라야 한다(예전 수동 배열 조작,
 *    지금은 `invalidateQueries`). 빠지면 목록이 옛 값을 계속 보여 준다.
 *  - 삭제 버튼은 `canDelete` 로만 나온다. 권한 분기가 무너져도 서버가 막아 주므로
 *    화면에서는 조용하다.
 */

const toast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

const SR_ID = 'sr-1';
const LIST_URL = `/api/srs/${SR_ID}/attachments`;

const A: SRAttachmentView = {
  id: 'att-1',
  fileName: '설계서.pdf',
  fileSize: 2048,
  fileType: 'application/pdf',
  fileUrl: 'https://files.example.com/att-1',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const B: SRAttachmentView = {
  id: 'att-2',
  fileName: '로그.txt',
  fileSize: 512,
  fileType: 'text/plain',
  fileUrl: 'https://files.example.com/att-2',
  createdAt: '2026-08-02T00:00:00.000Z',
};

const NEW: SRAttachmentView = {
  id: 'att-3',
  fileName: '신규.png',
  fileSize: 1024,
  fileType: 'image/png',
  fileUrl: 'https://files.example.com/att-3',
  createdAt: '2026-08-03T00:00:00.000Z',
};

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** 서버가 들고 있다고 가정하는 목록. 변이 핸들러가 여기를 고치면 재조회가 그 결과를 본다. */
let serverList: SRAttachmentView[] = [];
let getHandler: () => ReturnType<typeof jsonResponse>;
let postHandler: () => ReturnType<typeof jsonResponse>;
let deleteHandler: () => ReturnType<typeof jsonResponse>;

const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
  const method = init?.method ?? 'GET';
  if (method === 'GET') return Promise.resolve(getHandler());
  if (method === 'POST') return Promise.resolve(postHandler());
  if (method === 'DELETE') return Promise.resolve(deleteHandler());
  throw new Error(`예상하지 못한 요청: ${method}`);
});

const callsOf = (method: string) =>
  fetchMock.mock.calls.filter((call) => (call[1]?.method ?? 'GET') === method);

/** 실물 Provider 로 감싼다. retry:false / gcTime:0 이 없으면 실패 케이스가 재시도로 늘어진다. */
function renderCard(props: { canDelete?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SRAttachments srId={SR_ID} {...props} />
    </QueryClientProvider>
  );
}

/** jsdom 의 File 은 내용에서 size 를 계산한다. 10MB 를 실제로 만들지 않고 값만 덮어쓴다. */
const makeFile = (name: string, size: number) => {
  const file = new File(['x'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const uploadFile = (file: File) => {
  const input = document.getElementById('file-upload') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return input;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);

  serverList = [A, B];
  getHandler = () => jsonResponse(serverList);
  postHandler = () => {
    serverList = [NEW, ...serverList];
    return jsonResponse(NEW, 201);
  };
  deleteHandler = () => {
    serverList = serverList.filter((a) => a.id !== A.id);
    return jsonResponse({ message: '파일이 삭제되었습니다.' });
  };
});

describe('SRAttachments', () => {
  it('첨부 목록을 불러와 파일 수와 함께 그린다', async () => {
    renderCard();

    // 첫 조회 동안에는 카드 전체가 로딩 표시로 대체된다(예전 `loading` state 와 같은 규칙).
    expect(screen.getByText('로딩 중...')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('설계서.pdf')).toBeInTheDocument());
    expect(screen.getByText('로그.txt')).toBeInTheDocument();
    expect(screen.getByText('2개의 파일')).toBeInTheDocument();
    // 크기 포맷은 옮기지 않은 로직이지만, 목록 행이 실제로 그려졌는지의 증거로 함께 본다.
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
    expect(callsOf('GET')[0]![0]).toBe(LIST_URL);
  });

  it('첨부가 없으면 빈 목록 문구를 보여 준다', async () => {
    serverList = [];
    renderCard();

    await waitFor(() => expect(screen.getByText('첨부파일이 없습니다.')).toBeInTheDocument());
    expect(screen.getByText('0개의 파일')).toBeInTheDocument();
  });

  it('조회가 실패하면 고정 문구의 오류 토스트를 띄운다', async () => {
    // 403 을 쓰는 것은 의도다 — retryUnlessClientError 가 4xx 를 재시도하지 않으므로
    // 실패가 즉시 확정된다. 5xx 였다면 백오프를 기다려야 한다(아래 호출 수 단언 참조).
    getHandler = () => jsonResponse({ error: '권한이 없습니다.' }, 403);

    renderCard();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        // 서버 메시지가 아니라 화면 고정 문구를 쓰는 것이 이 카드의 계약이다.
        description: '첨부파일을 불러오는데 실패했습니다.',
        variant: 'destructive',
      })
    );
    expect(callsOf('GET')).toHaveLength(1);
    // 실패해도 목록은 빈 상태로 그려진다.
    await waitFor(() => expect(screen.getByText('첨부파일이 없습니다.')).toBeInTheDocument());
  });

  it('새로고침 버튼은 목록을 다시 읽는다', async () => {
    serverList = [A];
    renderCard();
    await waitFor(() => expect(screen.getByText('설계서.pdf')).toBeInTheDocument());

    serverList = [A, B];
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

    await waitFor(() => expect(screen.getByText('로그.txt')).toBeInTheDocument());
    expect(callsOf('GET')).toHaveLength(2);
  });

  it('업로드는 Content-Type 없는 FormData 를 보내고, 성공하면 목록을 다시 읽는다', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByText('설계서.pdf')).toBeInTheDocument());

    uploadFile(makeFile('신규.png', 1024));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '파일이 업로드되었습니다.',
      })
    );

    const post = callsOf('POST')[0]!;
    expect(post[0]).toBe('/api/attachments');

    const body = post[1]!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('신규.png');
    expect(body.get('srId')).toBe(SR_ID);

    // ⚠️ 계약의 핵심: multipart boundary 는 브라우저가 계산한다. 우리가 Content-Type 을
    //    넣으면 서버가 본문을 파싱하지 못한다.
    expect(new Headers(post[1]!.headers).get('Content-Type')).toBeNull();

    // 예전의 수동 낙관 갱신을 대신하는 무효화가 실제로 재조회를 일으켰는지.
    await waitFor(() => expect(callsOf('GET')).toHaveLength(2));
    expect(await screen.findByText('신규.png')).toBeInTheDocument();
    expect(screen.getByText('3개의 파일')).toBeInTheDocument();
  });

  it('10MB 를 넘는 파일은 요청을 보내기 전에 막는다', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByText('설계서.pdf')).toBeInTheDocument());

    uploadFile(makeFile('거대.zip', 10 * 1024 * 1024 + 1));

    expect(toast).toHaveBeenCalledWith({
      title: '오류',
      description: '파일 크기는 10MB를 초과할 수 없습니다.',
      variant: 'destructive',
    });
    expect(callsOf('POST')).toHaveLength(0);
  });

  it('업로드가 실패하면 서버 메시지를 오류 토스트로 보여 준다', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByText('설계서.pdf')).toBeInTheDocument());

    postHandler = () => jsonResponse({ error: '지원하지 않는 형식입니다.' }, 400);
    uploadFile(makeFile('악성.exe', 1024));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '지원하지 않는 형식입니다.',
        variant: 'destructive',
      })
    );
    // 실패했으니 재조회도 없다.
    expect(callsOf('GET')).toHaveLength(1);
  });

  it('canDelete 가 아니면 삭제 버튼이 없다', async () => {
    renderCard();
    await waitFor(() => expect(screen.getByText('설계서.pdf')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: '설계서.pdf 삭제' })).not.toBeInTheDocument();
    // 미리보기·다운로드는 권한과 무관하게 남는다.
    expect(screen.getByRole('button', { name: '설계서.pdf 미리보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설계서.pdf 다운로드' })).toBeInTheDocument();
  });

  it('확인 다이얼로그를 거쳐야 삭제하고, 성공하면 목록을 다시 읽는다', async () => {
    renderCard({ canDelete: true });
    await waitFor(() => expect(screen.getByText('설계서.pdf')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '설계서.pdf 삭제' }));

    // 확인 전에는 요청이 나가지 않는다.
    expect(callsOf('DELETE')).toHaveLength(0);
    expect(await screen.findByText('파일 삭제 확인')).toBeInTheDocument();

    // 다이얼로그가 열리면 목록 쪽 버튼은 aria-hidden 이라, 이름이 정확히 '삭제' 인 것은
    // 다이얼로그의 확인 버튼뿐이다.
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '파일이 삭제되었습니다.',
      })
    );
    expect(callsOf('DELETE')[0]![0]).toBe(`/api/attachments/${A.id}`);

    await waitFor(() => expect(callsOf('GET')).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText('설계서.pdf')).not.toBeInTheDocument());
    expect(screen.getByText('1개의 파일')).toBeInTheDocument();
  });

  it('삭제가 실패해도 서버 메시지 대신 고정 문구를 보여 준다', async () => {
    renderCard({ canDelete: true });
    await waitFor(() => expect(screen.getByText('설계서.pdf')).toBeInTheDocument());

    deleteHandler = () => jsonResponse({ error: '이미 삭제된 파일입니다.' }, 404);

    fireEvent.click(screen.getByRole('button', { name: '설계서.pdf 삭제' }));
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '파일 삭제에 실패했습니다.',
        variant: 'destructive',
      })
    );
    // 실패해도 목록은 그대로 남는다(재조회 없음).
    expect(screen.getByText('설계서.pdf')).toBeInTheDocument();
    expect(callsOf('GET')).toHaveLength(1);
  });
});
