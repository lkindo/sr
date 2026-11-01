import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateSRDialog } from '../CreateSRDialog';
import { EditSRDialog } from '../EditSRDialog';

/**
 * 다이얼로그를 목으로 바꾸지 않는다. 지키려는 것이 Radix 의 닫기 동작과 폼의 입력 판정이
 * 맞물린 결과라서, 목으로 바꾸면 Esc 도 바깥 클릭도 일어나지 않는다.
 *
 * 훅 목은 렌더마다 같은 참조를 돌려줘야 한다. `toast` 가 바뀌면 폼의 초기화 effect 가
 * 다시 돌아 끝나지 않는다(실제 훅의 값은 안정적이다).
 */
const mocks = vi.hoisted(() => ({
  hasAnyRole: vi.fn(),
  toast: { toast: vi.fn() },
  roles: ['ADMIN'],
  permissions: [] as string[],
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasAnyRole: mocks.hasAnyRole,
    roles: mocks.roles,
    permissions: mocks.permissions,
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => mocks.toast }));
vi.mock('@/hooks/use-sr', () => ({
  useUpdateSR: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/actions/sr.actions', () => ({
  createSRAction: vi.fn(),
  getSRRequesterCandidatesAction: async () => ({ success: true, data: [] }),
}));
vi.mock('@/actions/client.actions', () => ({
  getClientsForSelection: async () => ({
    success: true,
    data: [{ id: 'client-1', code: 'C1', name: '고객사' }],
  }),
}));
vi.mock('@/actions/service-category.actions', () => ({
  getServiceCategoriesForSelection: async () => ({
    success: true,
    data: [{ id: 'cat-1', categoryName: '장애' }],
  }),
}));
vi.mock('@/actions/user.actions', () => ({
  getProfileAction: async () => ({
    success: true,
    data: { clients: [{ client: { id: 'client-1', code: 'C1', name: '고객사' } }] },
  }),
}));

const SR = {
  id: 'sr-1',
  title: '기존 제목입니다',
  description: '기존 설명입니다. 열 글자가 넘습니다.',
  status: 'REQUESTED',
  actualPriority: null,
  clientId: 'client-1',
  serviceCategory: { id: 'cat-1', categoryName: '장애' },
  attachments: [
    {
      id: 'att-1',
      fileName: 'a.pdf',
      fileSize: 1024,
      fileUrl: '/a.pdf',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ] as never,
};

const titleInput = () => screen.findByLabelText(/제목/, { selector: 'input' });

const pressEscape = () => fireEvent.keyDown(document, { key: 'Escape' });

/**
 * Radix 는 다이얼로그가 열린 다음 틱에 바깥 클릭 감지를 걸고, 왼쪽 클릭의 닫기는 `click` 까지
 * 미룬다. 그래서 틱을 넘긴 뒤 pointerdown 과 click 을 함께 보내야 실제 클릭과 같다.
 */
async function clickOutside() {
  await new Promise((resolve) => setTimeout(resolve));
  fireEvent.pointerDown(document.body, { button: 0 });
  fireEvent.click(document.body);
}

beforeEach(() => {
  mocks.hasAnyRole.mockReturnValue(true);
});

describe('SR 생성 다이얼로그의 입력 보존', () => {
  const renderDialog = async () => {
    const onOpenChange = vi.fn();
    render(<CreateSRDialog open onOpenChange={onOpenChange} onCreated={vi.fn()} />);
    return { onOpenChange, title: await titleInput() };
  };

  it('입력이 없으면 Esc 로 닫힌다', async () => {
    const { onOpenChange } = await renderDialog();

    pressEscape();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('입력이 없으면 바깥 클릭으로 닫힌다', async () => {
    const { onOpenChange } = await renderDialog();

    await clickOutside();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('입력이 있으면 Esc 와 바깥 클릭으로 닫히지 않는다', async () => {
    const { onOpenChange, title } = await renderDialog();
    fireEvent.change(title, { target: { value: '쓰던 제목' } });

    pressEscape();
    await clickOutside();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(title).toHaveValue('쓰던 제목');
  });

  it('입력이 있어도 닫기 버튼과 취소로는 닫을 수 있다', async () => {
    const { onOpenChange, title } = await renderDialog();
    fireEvent.change(title, { target: { value: '쓰던 제목' } });

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('외부 사용자의 고객사는 자동으로 채워지므로 입력으로 치지 않는다', async () => {
    mocks.hasAnyRole.mockReturnValue(false);
    const { onOpenChange } = await renderDialog();
    // 고객사 자동 설정까지 끝난 뒤에 눌러야 이 경우를 시험한다.
    await waitFor(() => expect(screen.getAllByText('고객사 (C1)').length).toBeGreaterThan(0));

    pressEscape();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('SR 수정 다이얼로그의 입력 보존', () => {
  const renderDialog = async () => {
    const onOpenChange = vi.fn();
    const view = render(
      <EditSRDialog open onOpenChange={onOpenChange} sr={SR} onUpdated={vi.fn()} />
    );
    const title = await titleInput();
    await waitFor(() => expect(title).toHaveValue(SR.title));
    return { ...view, onOpenChange, title };
  };

  it('고치지 않았으면 Esc 로 닫힌다', async () => {
    const { onOpenChange } = await renderDialog();

    pressEscape();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('고쳤으면 Esc 와 바깥 클릭으로 닫히지 않는다', async () => {
    const { onOpenChange, title } = await renderDialog();
    fireEvent.change(title, { target: { value: '고친 제목입니다' } });

    pressEscape();
    await clickOutside();

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('처음 값으로 되돌리면 다시 Esc 로 닫힌다', async () => {
    const { onOpenChange, title } = await renderDialog();
    fireEvent.change(title, { target: { value: '고친 제목입니다' } });
    fireEvent.change(title, { target: { value: SR.title } });

    pressEscape();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('다른 사용자의 수정으로 sr 이 바뀌어도 내 입력으로 치지 않는다', async () => {
    const { onOpenChange, rerender } = await renderDialog();

    rerender(
      <EditSRDialog
        open
        onOpenChange={onOpenChange}
        sr={{ ...SR, title: '다른 사용자가 고친 제목' }}
        onUpdated={vi.fn()}
      />
    );
    pressEscape();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
