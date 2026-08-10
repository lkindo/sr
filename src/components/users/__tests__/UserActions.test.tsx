import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToast } from '@/hooks/use-toast';

import { UserActions } from '../UserActions';

/**
 * 사용자 행 액션 버튼(역할 관리 · 활성/비활성 · 삭제).
 *
 * 이 컴포넌트가 실제로 하는 일은 **버튼을 그리는 것이 아니라 막는 것**이다.
 * 세 핸들러가 각각 세션 역할을 다시 확인하고(`await update()` 후), 통과하지 못하면
 * 콜백을 부르지 않고 토스트만 띄운다. 서버 라우트가 최종 방어선이긴 하지만 이 층이
 * 무너지면 관리자가 아닌 사용자가 삭제 요청을 쏘고 400 만 받는다 — 즉 화면은
 * "왜 안 되는지" 를 설명하지 못한다.
 *
 * 그래서 여기서는 **역할 조합마다 콜백이 불렸는가 / 어떤 토스트가 나갔는가**를 단언한다.
 * 삭제는 조건이 세 겹(관리자 · 본인 아님 · 시스템 역할 아님)이라 각 겹을 따로 태운다.
 *
 * PermissionGuard 는 목하지 않는다. 삭제 버튼이 보이는지 자체가 세션 역할에 달린
 * 판정이고, 그 판정도 이 화면의 계약이기 때문이다.
 */

const mocks = vi.hoisted(() => ({
  session: null as { user?: { id?: string; roles?: string[] } } | null,
  update: vi.fn(async () => null),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: mocks.session, update: mocks.update }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

const toast = vi.fn();

/** 세션을 이 역할들로 로그인한 상태로 만든다. `null` 은 비로그인. */
function signIn(roles: string[] | null, id = 'me') {
  mocks.session = roles === null ? null : { user: { id, roles } };
}

type Variant = 'table' | 'card';

const VARIANTS: Array<[Variant]> = [['table'], ['card']];

interface TestUser {
  id: string;
  name: string;
  isActive: boolean;
  roles: Array<{ role: { name: string } }>;
}

const makeUser = (over: Partial<TestUser> = {}): TestUser => ({
  id: 'u-1',
  name: '홍길동',
  isActive: true,
  roles: [{ role: { name: 'ENGINEER' } }],
  ...over,
});

const callbacks = {
  onAssignRoles: vi.fn(),
  onToggleActive: vi.fn(),
  onDelete: vi.fn(),
};

function renderActions(
  props: { user?: TestUser; variant?: 'table' | 'card' } = {}
): typeof callbacks {
  const { user = makeUser(), variant } = props;
  render(
    <UserActions
      user={user}
      onAssignRoles={callbacks.onAssignRoles}
      onToggleActive={callbacks.onToggleActive}
      onDelete={callbacks.onDelete}
      {...(variant ? { variant } : {})}
    />
  );
  return callbacks;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useToast).mockReturnValue({ toast } as never);
  signIn(['ADMIN']);
});

describe('UserActions — 변형별 표시', () => {
  // variant 를 주지 않으면 'table' 이다. 기본값 경로가 카드 레이아웃으로 새면
  // 데스크톱 표 안에 3열 그리드가 박힌다.
  it('variant 를 생략하면 표 레이아웃(긴 라벨)로 그린다', () => {
    renderActions();

    expect(screen.getByText('역할 관리')).toBeInTheDocument();
    expect(screen.getByText('비활성화')).toBeInTheDocument();
    expect(screen.queryByText('역할')).not.toBeInTheDocument();
  });

  it('variant="card" 는 모바일용 짧은 라벨로 그린다', () => {
    renderActions({ variant: 'card' });

    expect(screen.getByText('역할')).toBeInTheDocument();
    expect(screen.getByText('비활성')).toBeInTheDocument();
    expect(screen.queryByText('역할 관리')).not.toBeInTheDocument();
  });

  // 버튼 라벨은 "지금 상태" 가 아니라 "누르면 벌어질 일" 이어야 한다.
  const activeLabels: Array<[Variant, boolean, string]> = [
    ['table', true, '비활성화'],
    ['table', false, '활성화'],
    ['card', true, '비활성'],
    ['card', false, '활성'],
  ];

  it.each(activeLabels)(
    'variant=%s · isActive=%s 이면 %s 버튼을 보여 준다',
    (variant, isActive, label) => {
      renderActions({ user: makeUser({ isActive }), variant });

      expect(screen.getByText(label)).toBeInTheDocument();
    }
  );

  it.each(VARIANTS)('%s: 관리자가 아니면 삭제 버튼 자체가 없다', (variant) => {
    signIn(['MANAGER']);

    renderActions({ variant });

    expect(screen.queryByText('삭제')).not.toBeInTheDocument();
  });

  it.each(VARIANTS)('%s: 관리자에게는 삭제 버튼이 보인다', (variant) => {
    signIn(['ADMIN']);

    renderActions({ variant });

    expect(screen.getByText('삭제')).toBeInTheDocument();
  });

  it('비로그인 세션에서도 삭제 버튼은 숨는다', () => {
    signIn(null);

    renderActions();

    expect(screen.queryByText('삭제')).not.toBeInTheDocument();
    // 나머지 버튼은 남는다 — 권한 판정은 클릭 시점에 한다.
    expect(screen.getByText('역할 관리')).toBeInTheDocument();
  });
});

describe('UserActions — 역할 관리', () => {
  it('관리자면 대상 사용자를 그대로 넘긴다', async () => {
    const user = makeUser();
    const { onAssignRoles } = renderActions({ user });

    fireEvent.click(screen.getByText('역할 관리'));

    await waitFor(() => expect(onAssignRoles).toHaveBeenCalledWith(user));
    expect(toast).not.toHaveBeenCalled();
  });

  // 세션은 캐시라 오래됐을 수 있다. 판정 전에 갱신하지 않으면 방금 역할을 받은
  // 사람이 계속 막힌다.
  it('판정 전에 세션을 갱신한다', async () => {
    renderActions();

    fireEvent.click(screen.getByText('역할 관리'));

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
  });

  it('관리자가 아니면 콜백 대신 토스트를 띄운다', async () => {
    signIn(['MANAGER', 'ENGINEER']);
    const { onAssignRoles } = renderActions();

    fireEvent.click(screen.getByText('역할 관리'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '권한 없음', variant: 'destructive' })
      )
    );
    // 현재 역할을 함께 알려 줘야 "왜 막혔는지" 를 사람이 판단할 수 있다.
    expect(vi.mocked(toast).mock.calls[0]![0]).toMatchObject({
      description: expect.stringContaining('MANAGER, ENGINEER'),
    });
    expect(onAssignRoles).not.toHaveBeenCalled();
  });

  it('역할이 하나도 없으면 "없음" 이라고 적는다', async () => {
    signIn([]);
    renderActions();

    fireEvent.click(screen.getByText('역할 관리'));

    await waitFor(() =>
      expect(vi.mocked(toast).mock.calls[0]![0]).toMatchObject({
        description: expect.stringContaining('현재 역할: 없음'),
      })
    );
  });

  it('세션이 없으면 역할을 빈 목록으로 보고 막는다', async () => {
    signIn(null);
    const { onAssignRoles } = renderActions();

    fireEvent.click(screen.getByText('역할 관리'));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(onAssignRoles).not.toHaveBeenCalled();
  });

  // 이 버튼들은 클릭 가능한 행 안에 놓인다. 이벤트가 새면 역할 다이얼로그를 여는
  // 동시에 상세 페이지로 이동해 버린다.
  it('클릭이 부모로 전파되지 않는다', async () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <UserActions
          user={makeUser()}
          onAssignRoles={callbacks.onAssignRoles}
          onToggleActive={callbacks.onToggleActive}
          onDelete={callbacks.onDelete}
        />
      </div>
    );

    fireEvent.click(screen.getByText('역할 관리'));

    await waitFor(() => expect(callbacks.onAssignRoles).toHaveBeenCalled());
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('UserActions — 활성/비활성 전환', () => {
  // 활성 전환은 관리자와 매니저 **둘 다** 할 수 있다. 삭제와 다른 지점이라
  // 두 역할을 각각 태운다 — `||` 의 오른쪽만 지워도 매니저가 조용히 막힌다.
  it.each(['ADMIN', 'MANAGER'])('%s 는 전환할 수 있다', async (role) => {
    signIn([role]);
    const { onToggleActive } = renderActions();

    fireEvent.click(screen.getByText('비활성화'));

    await waitFor(() => expect(onToggleActive).toHaveBeenCalledWith('u-1', true));
    expect(toast).not.toHaveBeenCalled();
  });

  it('현재 활성 상태를 그대로 넘긴다 (서버가 뒤집는다)', async () => {
    const { onToggleActive } = renderActions({ user: makeUser({ isActive: false }) });

    fireEvent.click(screen.getByText('활성화'));

    await waitFor(() => expect(onToggleActive).toHaveBeenCalledWith('u-1', false));
  });

  it.each([['ENGINEER'], ['CLIENT_USER']])('%s 는 전환할 수 없다', async (role) => {
    signIn([role]);
    const { onToggleActive } = renderActions();

    fireEvent.click(screen.getByText('비활성화'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '권한 없음', variant: 'destructive' })
      )
    );
    expect(onToggleActive).not.toHaveBeenCalled();
  });

  it('카드 변형에서도 같은 판정을 한다', async () => {
    signIn(['ENGINEER']);
    const { onToggleActive } = renderActions({ variant: 'card' });

    fireEvent.click(screen.getByText('비활성'));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(onToggleActive).not.toHaveBeenCalled();
  });
});

describe('UserActions — 삭제', () => {
  // 삭제는 세 겹으로 막힌다. 겹마다 다른 제목을 쓰는 이유는 사용자가 취할 행동이
  // 다르기 때문이다: 권한을 얻어라 / 다른 계정으로 하라 / 역할을 먼저 내려라.
  it('관리자면 대상 사용자를 넘긴다', async () => {
    const user = makeUser();
    const { onDelete } = renderActions({ user });

    fireEvent.click(screen.getByText('삭제'));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(user));
    expect(toast).not.toHaveBeenCalled();
  });

  it('역할이 하나도 없는 사용자도 삭제할 수 있다', async () => {
    const user = makeUser({ roles: [] });
    const { onDelete } = renderActions({ user });

    fireEvent.click(screen.getByText('삭제'));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(user));
  });

  it('자기 자신은 삭제할 수 없다', async () => {
    signIn(['ADMIN'], 'u-1');
    const { onDelete } = renderActions({ user: makeUser({ id: 'u-1' }) });

    fireEvent.click(screen.getByText('삭제'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '삭제 불가', variant: 'destructive' })
      )
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  // 마지막 관리자를 지워 시스템을 잠글 수 없게 한다.
  it.each(['ADMIN', 'MANAGER'])('%s 역할을 가진 계정은 삭제를 막는다', async (role) => {
    const { onDelete } = renderActions({
      user: makeUser({ roles: [{ role: { name: 'ENGINEER' } }, { role: { name: role } }] }),
    });

    fireEvent.click(screen.getByText('삭제'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '삭제 제한', variant: 'destructive' })
      )
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('시스템 역할이 아닌 역할만 가진 계정은 통과시킨다', async () => {
    const { onDelete } = renderActions({
      user: makeUser({
        roles: [{ role: { name: 'ENGINEER' } }, { role: { name: 'CLIENT_USER' } }],
      }),
    });

    fireEvent.click(screen.getByText('삭제'));

    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  // 자기 자신이면서 관리자 역할도 가진 계정 — 두 조건이 동시에 걸린다.
  // 순서가 뒤집히면 "시스템 관리자 계정은 삭제할 수 없습니다(역할을 내리세요)" 라는
  // 엉뚱한 안내가 나가고, 자기 역할을 내리려다 계정을 잠근다.
  it('본인 판정이 시스템 역할 판정보다 먼저다', async () => {
    signIn(['ADMIN'], 'u-1');
    const { onDelete } = renderActions({
      user: makeUser({ id: 'u-1', roles: [{ role: { name: 'ADMIN' } }] }),
    });

    fireEvent.click(screen.getByText('삭제'));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(vi.mocked(toast).mock.calls[0]![0]).toMatchObject({ title: '삭제 불가' });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('카드 변형에서도 삭제 판정은 같다', async () => {
    signIn(['ADMIN'], 'me');
    const { onDelete } = renderActions({
      user: makeUser({ roles: [{ role: { name: 'MANAGER' } }] }),
      variant: 'card',
    });

    fireEvent.click(screen.getByText('삭제'));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '삭제 제한' }))
    );
    expect(onDelete).not.toHaveBeenCalled();
  });
});
