import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteClientAction } from '@/actions/client.actions';
import { useToast } from '@/hooks/use-toast';

import { DeleteClientDialog } from '../DeleteClientDialog';

vi.mock('@/actions/client.actions', () => ({
  deleteClientAction: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

// Radix 의 Dialog 는 포털·포인터 이벤트를 요구해 jsdom 에서 테스트를 라이브러리 구현에
// 묶는다. 여기서 볼 것은 삭제 요청의 성패 처리이지 Radix 의 렌더가 아니다.
vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

/**
 * 고객사 삭제 확인 다이얼로그.
 *
 * 삭제는 되돌릴 수 없으므로 이 컴포넌트가 틀리면 손해가 즉시 확정된다. 지켜야 하는 것은 넷:
 *
 *   1. **서버 액션은 실패를 던지지 않고 `{ success: false }` 로 돌려준다.** 그 값을 보지
 *      않으면 삭제되지 않았는데 "성공" 토스트가 뜨고 다이얼로그가 닫힌다 — 사용자는
 *      지워졌다고 믿는다(이 저장소에서 실제로 있었던 "삼켜진 액션 실패" 부류).
 *   2. 실패 사유는 **서버가 준 문구를 그대로** 보여 준다. 참조 무결성 위반(SR 이 남아 있음)
 *      같은 이유는 고정 문구로 뭉개면 사용자가 다음 행동을 정할 수 없다. 다만 액션이
 *      사유 없이 실패를 돌려주는 경우도 있어 기본 문구가 필요하다.
 *   3. 진행 중에는 두 버튼 모두 잠근다. 취소가 열려 있으면 요청이 날아가는 중에 닫히고,
 *      삭제가 열려 있으면 같은 삭제가 두 번 나간다.
 *   4. `client` 가 없으면 아무 요청도 보내지 않는다. 목록 화면은 다이얼로그를 항상
 *      마운트해 두고 `client` 로만 대상을 바꾸므로, 이 가드가 없으면 대상 없는 삭제가 나간다.
 */

const toast = vi.fn();

const CLIENT = { id: 'c-1', name: '가나 주식회사', code: 'C001' };

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  client: CLIENT,
  onDeleted: vi.fn(),
};

const clickDelete = () => fireEvent.click(screen.getByRole('button', { name: '삭제' }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useToast).mockReturnValue({ toast } as never);
  vi.mocked(deleteClientAction).mockResolvedValue({
    success: true,
    message: '고객사가 성공적으로 삭제되었습니다.',
  } as never);
});

describe('DeleteClientDialog — 렌더', () => {
  it('열려 있으면 대상 고객사의 이름과 코드를 확인시킨다', () => {
    render(<DeleteClientDialog {...baseProps} />);

    expect(screen.getByText('고객사 삭제')).toBeInTheDocument();
    expect(screen.getByText('가나 주식회사')).toBeInTheDocument();
    expect(screen.getByText(/C001/)).toBeInTheDocument();
    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeInTheDocument();
  });

  it('닫혀 있으면 아무것도 렌더하지 않는다', () => {
    render(<DeleteClientDialog {...baseProps} open={false} />);

    expect(screen.queryByText('고객사 삭제')).not.toBeInTheDocument();
  });

  // 목록 화면은 다이얼로그를 계속 마운트해 두고 `client` 로만 대상을 바꾼다.
  it('대상이 없어도 깨지지 않고, 삭제를 눌러도 요청을 보내지 않는다', async () => {
    const onDeleted = vi.fn();
    render(<DeleteClientDialog {...baseProps} client={null} onDeleted={onDeleted} />);

    expect(screen.getByText('고객사 삭제')).toBeInTheDocument();
    clickDelete();

    await waitFor(() => expect(deleteClientAction).not.toHaveBeenCalled());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('취소는 닫기만 하고 삭제하지 않는다', () => {
    const onOpenChange = vi.fn();
    render(<DeleteClientDialog {...baseProps} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(deleteClientAction).not.toHaveBeenCalled();
  });
});

describe('DeleteClientDialog — 삭제', () => {
  it('성공하면 대상 id 로 지우고, 닫은 뒤 부모에게 알린다', async () => {
    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    render(<DeleteClientDialog {...baseProps} onOpenChange={onOpenChange} onDeleted={onDeleted} />);

    clickDelete();

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deleteClientAction).toHaveBeenCalledWith('c-1');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '성공', description: '고객사가 삭제되었습니다.' })
    );
    // 목록 갱신 전에 닫아야 사용자가 사라지는 행을 보지 않는다.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // 액션은 실패를 던지지 않는다. 반환값을 보지 않으면 "성공" 이 뜨고 닫힌다.
  it('액션이 실패를 돌려주면 그 사유를 보여 주고 닫지 않는다', async () => {
    vi.mocked(deleteClientAction).mockResolvedValue({
      success: false,
      error: '진행 중인 SR 이 있어 삭제할 수 없습니다.',
    } as never);
    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    render(<DeleteClientDialog {...baseProps} onOpenChange={onOpenChange} onDeleted={onDeleted} />);

    clickDelete();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '오류',
          variant: 'destructive',
          description: '진행 중인 SR 이 있어 삭제할 수 없습니다.',
        })
      )
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('사유 없이 실패하면 기본 문구로 대신한다', async () => {
    vi.mocked(deleteClientAction).mockResolvedValue({ success: false } as never);
    render(<DeleteClientDialog {...baseProps} />);

    clickDelete();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: '고객사 삭제에 실패했습니다.',
        })
      )
    );
  });

  // 네트워크가 끊기면 서버 액션 호출 자체가 거절된다(반환값이 아니라 예외다).
  it('액션이 예외를 던지면 그 메시지를 보여 준다', async () => {
    vi.mocked(deleteClientAction).mockRejectedValue(new Error('Failed to fetch'));
    render(<DeleteClientDialog {...baseProps} />);

    clickDelete();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'Failed to fetch' })
      )
    );
  });

  // Error 가 아닌 값이 던져질 수도 있다(문자열 reject 등). `.message` 를 그냥 읽으면
  // undefined 가 그대로 토스트에 실린다.
  it('Error 가 아닌 것이 던져지면 기본 문구로 대신한다', async () => {
    vi.mocked(deleteClientAction).mockRejectedValue('boom');
    render(<DeleteClientDialog {...baseProps} />);

    clickDelete();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: '고객사 삭제에 실패했습니다.',
        })
      )
    );
  });
});

describe('DeleteClientDialog — 진행 중 잠금', () => {
  it('요청이 끝날 때까지 두 버튼을 잠근다', async () => {
    let release!: (value: unknown) => void;
    vi.mocked(deleteClientAction).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never
    );
    render(<DeleteClientDialog {...baseProps} />);

    clickDelete();

    // 삭제가 열려 있으면 같은 삭제가 두 번, 취소가 열려 있으면 요청 중에 닫힌다.
    const deleting = await screen.findByRole('button', { name: '삭제 중...' });
    expect(deleting).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();

    release({ success: true, message: 'ok' });

    await waitFor(() => expect(screen.getByRole('button', { name: '삭제' })).not.toBeDisabled());
  });

  it('실패로 끝나도 잠금이 풀려 다시 시도할 수 있다', async () => {
    vi.mocked(deleteClientAction).mockRejectedValue(new Error('Failed to fetch'));
    render(<DeleteClientDialog {...baseProps} />);

    clickDelete();

    // finally 가 없으면 버튼이 영구 비활성이 되어 다이얼로그를 닫았다 여는 수밖에 없다.
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '삭제' })).not.toBeDisabled();
  });
});
