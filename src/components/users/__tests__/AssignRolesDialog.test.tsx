import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useToast } from '@/hooks/use-toast';

import { type AssignableRole, AssignRolesDialog } from '../AssignRolesDialog';

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

/**
 * 역할 할당 다이얼로그.
 *
 * 이 컴포넌트의 진짜 역할은 **서버가 거절한 이유를 사람이 고칠 수 있는 형태로 옮기는
 * 것**이다. `/api/users/[id]/roles` 는 역할 상호 배타성을 어기면 단순한 400 이 아니라
 * 어떤 역할이 왜 충돌했는지를 담아 돌려준다(systemRoles / clientRoles / assignedClients).
 * 그 필드를 화면이 무시하면 관리자는 "저장이 안 된다" 만 보고 원인을 알 수 없다.
 *
 * 그래서 여기서는 응답 형태별로 **다른 안내가 나가는지**를 단언한다. 라우트 테스트가
 * "서버가 그 정보를 준다" 를 보증하고, 이 테스트가 "화면이 그 정보를 쓴다" 를 보증한다.
 * 둘 중 하나만 있으면 사이가 끊겨도 아무도 모른다.
 */

const toast = vi.fn();

const ROLES: AssignableRole[] = [
  { id: 'r-1', name: 'ENGINEER', description: '기술 지원' },
  { id: 'r-2', name: 'CLIENT_USER', description: null },
  { id: 'r-3', name: 'MANAGER', description: '관리자' },
];

const USER = {
  id: 'u-1',
  name: '홍길동',
  email: 'hong@example.com',
  roles: [{ role: { id: 'r-1', name: 'ENGINEER' } }],
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  user: USER,
  onSaved: vi.fn(),
  availableRoles: ROLES,
};

const save = () => fireEvent.click(screen.getByRole('button', { name: /저장|할당/ }));

/**
 * 실물 Provider 로 감싼다.
 *
 * `@tanstack/react-query` 를 통째로 목킹하면 useQuery 만 있고 useMutation 이 없어서 죽는다.
 * `retry: false` / `gcTime: 0` 은 실패 케이스(거절·네트워크 오류)가 재시도로 타임아웃나지
 * 않게 하고, 테스트끼리 캐시가 새지 않게 한다.
 */
function renderDialog(props: Partial<Parameters<typeof AssignRolesDialog>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(<AssignRolesDialog {...baseProps} {...props} />, { wrapper });
}

/**
 * api-client 는 성공 응답에서 `text()` 로 본문을 읽고(204·빈 본문 허용), 실패 응답에서만
 * `json()` 을 읽는다. 목이 둘 다 갖고 있어야 진짜 응답처럼 굴러간다.
 */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** 서버가 이 본문으로 거절했다고 가정한다. */
const rejectWith = (body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse(400, body))
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useToast).mockReturnValue({ toast } as never);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse(200, {}))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssignRolesDialog — 표시', () => {
  it('전달받은 역할 목록을 보여 준다', () => {
    renderDialog();

    expect(screen.getByText('ENGINEER')).toBeInTheDocument();
    expect(screen.getByText('CLIENT_USER')).toBeInTheDocument();
  });

  it('availableRoles 를 주면 /api/roles 를 부르지 않는다', () => {
    renderDialog();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('검색어로 역할을 좁힌다', () => {
    renderDialog();

    fireEvent.change(screen.getByPlaceholderText('역할 검색...'), {
      target: { value: 'client' },
    });

    // 대소문자를 가리지 않아야 한다 — 역할 이름은 전부 대문자다.
    expect(screen.getByText('CLIENT_USER')).toBeInTheDocument();
    expect(screen.queryByText('ENGINEER')).not.toBeInTheDocument();
  });

  it('닫혀 있으면 렌더하지 않는다', () => {
    renderDialog({ open: false });

    expect(screen.queryByText('ENGINEER')).not.toBeInTheDocument();
  });
});

describe('AssignRolesDialog — 저장', () => {
  it('선택한 역할 id 로 POST 한다', async () => {
    renderDialog();
    fireEvent.click(screen.getByText('CLIENT_USER'));

    save();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/users/u-1/roles');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string).roleIds).toContain('r-2');
  });

  it('성공하면 onSaved 와 닫기를 부른다', async () => {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ onSaved, onOpenChange });

    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // 다이얼로그는 **기존 역할이 선택된 상태**로 열린다. 빈 상태로 열리면 관리자가
  // 역할 하나를 추가하려다 나머지를 전부 날리게 된다 — 이 라우트는 교체(replace)라
  // 보내지 않은 역할은 회수된다.
  it('기존 역할이 미리 선택된 채 열린다', async () => {
    renderDialog();

    save();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string).roleIds).toEqual(['r-1']);
  });

  // 반대로 전부 해제하는 것도 정당한 요청이다. 빈 배열이 막히면 회수할 방법이 없다.
  it('전부 해제하면 빈 배열로 보낸다', async () => {
    renderDialog();
    fireEvent.click(screen.getByText('ENGINEER'));

    save();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string).roleIds).toEqual([]);
  });
});

describe('AssignRolesDialog — 서버 거절 사유 전달', () => {
  // 라우트 테스트가 "서버가 systemRoles·clientRoles 를 준다" 를 보증한다.
  // 여기서는 화면이 그것을 실제로 쓰는지 본다.
  it('역할 충돌은 어느 역할끼리 부딪혔는지 보여 준다', async () => {
    rejectWith({
      error: '시스템 운영팀과 고객사 팀 역할을 동시에 부여할 수 없습니다',
      systemRoles: ['ENGINEER'],
      clientRoles: ['CLIENT_USER'],
      suggestion: '하나의 역할 그룹만 선택하세요.',
    });
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    save();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '역할 충돌', variant: 'destructive' })
      )
    );
    // 실패했으면 다이얼로그가 열려 있어야 관리자가 선택을 고칠 수 있다.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('고객사 할당 충돌은 어느 고객사인지 보여 준다', async () => {
    rejectWith({
      error: '시스템 운영팀 역할은 고객사가 할당된 사용자에게 부여할 수 없습니다',
      assignedClients: [{ id: 'c-1', name: '테스트 고객사 A' }],
      suggestion: '먼저 고객사 할당을 해제하세요.',
    });
    renderDialog();

    save();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '역할 할당 제한', variant: 'destructive' })
      )
    );
  });

  // 위 두 형태에 해당하지 않는 거절은 서버 메시지를 그대로 보여 준다.
  it('그 밖의 거절은 서버 메시지를 그대로 보여 준다', async () => {
    rejectWith({ error: '역할을 할당할 권한이 없습니다.' });
    renderDialog();

    save();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: '역할을 할당할 권한이 없습니다.' })
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
    renderDialog();

    save();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /저장|할당/ })).not.toBeDisabled()
    );
  });
});
