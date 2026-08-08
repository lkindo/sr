import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createClientAction, updateClientAction } from '@/actions/client.actions';
import { useToast } from '@/hooks/use-toast';

import { ClientDialog } from '../ClientDialog';

vi.mock('@/actions/client.actions', () => ({
  createClientAction: vi.fn(),
  updateClientAction: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));

vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

/**
 * 고객사 생성·수정 다이얼로그.
 *
 * 이 폼은 서버 액션(`createClientAction` / `updateClientAction`)에 FormData 를 넘긴다.
 * 그래서 여기서 볼 것은 렌더가 아니라 **경계를 넘는 값**이다.
 *
 * 액션은 실패를 던지지 않고 `{ success: false }` 로 돌려준다. 폼이 그것을 확인하지 않으면
 * **실패했는데 "성공" 토스트가 뜨고 목록이 닫힌다** — 사용자는 저장됐다고 믿는다.
 * 이 프로젝트에서 실제로 있었던 종류의 결함이라(감사 기록의 "삼켜진 액션 실패") 그
 * 경로를 우선 단언한다.
 *
 * 또 하나: `isActive` 는 체크박스지만 FormData 에는 **문자열**로 실린다. boolean 을
 * 그대로 넣으면 'true'/'false' 가 아니라 'on' 이 되거나 아예 빠져, 비활성 고객사가
 * 활성으로 저장된다.
 */

const toast = vi.fn();

const CLIENT = {
  id: 'c-1',
  code: 'C001',
  name: '테스트 고객사 A',
  industry: '제조',
  contactPerson: '김담당',
  contactEmail: 'k@example.com',
  contactPhone: '010-0000-0000',
  address: '서울',
  contractStartDate: null,
  contractEndDate: null,
  isActive: true,
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  client: null,
  onSaved: vi.fn(),
};

const fill = (id: string, value: string) =>
  fireEvent.change(document.getElementById(id)!, { target: { value } });

const submit = () => fireEvent.click(screen.getByRole('button', { name: '저장' }));

/** 마지막 액션 호출에 실린 FormData 를 평범한 객체로 편다. */
const sentForm = (fn: typeof createClientAction | typeof updateClientAction) => {
  const calls = vi.mocked(fn).mock.calls;
  const fd = calls[calls.length - 1]!.at(-1) as FormData;
  return Object.fromEntries(fd.entries());
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useToast).mockReturnValue({ toast } as never);
  vi.mocked(createClientAction).mockResolvedValue({ success: true, data: CLIENT } as never);
  vi.mocked(updateClientAction).mockResolvedValue({ success: true, data: CLIENT } as never);
});

describe('ClientDialog — 모드', () => {
  it('client 가 없으면 생성 모드로 연다', () => {
    render(<ClientDialog {...baseProps} />);

    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
    expect((document.getElementById('code') as HTMLInputElement).value).toBe('');
  });

  it('client 가 있으면 기존 값을 채운다', () => {
    render(<ClientDialog {...baseProps} client={CLIENT as never} />);

    expect((document.getElementById('code') as HTMLInputElement).value).toBe('C001');
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('테스트 고객사 A');
  });

  it('닫혀 있으면 렌더하지 않는다', () => {
    render(<ClientDialog {...baseProps} open={false} />);

    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
  });
});

describe('ClientDialog — 저장', () => {
  it('생성은 createClientAction 을 부른다', async () => {
    render(<ClientDialog {...baseProps} />);
    fill('code', 'C009');
    fill('name', '새 고객사');

    submit();

    await waitFor(() => expect(createClientAction).toHaveBeenCalled());
    expect(updateClientAction).not.toHaveBeenCalled();
    expect(sentForm(createClientAction)).toMatchObject({ code: 'C009', name: '새 고객사' });
  });

  it('수정은 updateClientAction 을 고객사 id 와 함께 부른다', async () => {
    render(<ClientDialog {...baseProps} client={CLIENT as never} />);
    fill('name', '이름 변경');

    submit();

    await waitFor(() => expect(updateClientAction).toHaveBeenCalled());
    expect(vi.mocked(updateClientAction).mock.calls[0]![0]).toBe('c-1');
    expect(createClientAction).not.toHaveBeenCalled();
  });

  // boolean 을 그대로 넣으면 'on' 이 되거나 빠져서, 비활성 고객사가 활성으로 저장된다.
  it('isActive 를 문자열로 싣는다', async () => {
    render(<ClientDialog {...baseProps} />);
    fill('code', 'C009');
    fill('name', '새 고객사');

    submit();

    await waitFor(() => expect(createClientAction).toHaveBeenCalled());
    expect(sentForm(createClientAction).isActive).toBe('true');
  });

  it('선택 입력은 비어 있어도 키가 빠지지 않는다', async () => {
    render(<ClientDialog {...baseProps} />);
    fill('code', 'C009');
    fill('name', '새 고객사');

    submit();

    await waitFor(() => expect(createClientAction).toHaveBeenCalled());
    const form = sentForm(createClientAction);
    // 서버 스키마가 빈 문자열을 null 로 정규화한다. 키 자체가 빠지면 "변경 없음" 이
    // 되어 값을 지울 수 없다.
    expect(form).toHaveProperty('industry');
    expect(form).toHaveProperty('address');
  });

  it('성공하면 onSaved 를 부른다', async () => {
    const onSaved = vi.fn();
    render(<ClientDialog {...baseProps} onSaved={onSaved} />);
    fill('code', 'C009');
    fill('name', '새 고객사');

    submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});

describe('ClientDialog — 실패 처리', () => {
  // 액션은 던지지 않고 { success: false } 를 돌려준다. 확인하지 않으면 실패했는데
  // "성공" 토스트가 뜨고 다이얼로그가 닫힌다.
  it('액션이 실패를 돌려주면 성공으로 처리하지 않는다', async () => {
    vi.mocked(createClientAction).mockResolvedValue({
      success: false,
      error: '이미 사용 중인 고객사 코드입니다.',
    } as never);
    const onSaved = vi.fn();
    render(<ClientDialog {...baseProps} onSaved={onSaved} />);
    fill('code', 'C001');
    fill('name', '중복 코드');

    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: '이미 사용 중인 고객사 코드입니다.',
        })
      )
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('사유가 없어도 기본 문구로 알린다', async () => {
    vi.mocked(createClientAction).mockResolvedValue({ success: false } as never);
    render(<ClientDialog {...baseProps} />);
    fill('code', 'C009');
    fill('name', '새 고객사');

    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: '고객사 저장에 실패했습니다.' })
      )
    );
  });

  it('액션이 던져도 저장 버튼이 다시 눌린다', async () => {
    vi.mocked(createClientAction).mockRejectedValue(new Error('Network error'));
    render(<ClientDialog {...baseProps} />);
    fill('code', 'C009');
    fill('name', '새 고객사');

    submit();

    // loading 이 안 풀리면 버튼이 영구 비활성이 되어 재시도할 수 없다.
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled());
  });
});
