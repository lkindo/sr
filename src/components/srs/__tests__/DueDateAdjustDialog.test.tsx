import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { qk } from '@/lib/query-keys';

import { DueDateAdjustDialog } from '../DueDateAdjustDialog';
import { SRDueDateField } from '../SRDueDateField';

/**
 * 마감일 수동 조정 화면 (헌법 §3, 소유자 결정 2026-09-18 D8).
 *
 *  - 입력은 KST 로 읽어 ISO 순간으로 보낸다(브라우저 타임존과 무관하게 같은 순간).
 *  - 새 마감일과 사유가 모두 있어야 보낼 수 있고, 지금 값과 같으면 보내지 않는다.
 *  - 서버 거부 사유(비우기 금지·사유 필수·권한)를 다이얼로그에 남긴다.
 * SR 상세의 SLA 마감일 칸은 **저장된 마감일**을 보여 준다(예전에는 예상 완료일이었다).
 */

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

const CURRENT_DUE = '2026-09-20T09:00:00.000Z'; // KST 2026-09-20 18:00

function renderDialog(client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })) {
  const onOpenChange = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(
    <DueDateAdjustDialog
      srId="sr-1"
      srNumber="SR-001"
      currentDueDate={CURRENT_DUE}
      open
      onOpenChange={onOpenChange}
    />,
    { wrapper }
  );
  return { onOpenChange, client };
}

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse(200, { id: 'sr-1' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const dateInput = () => screen.getByLabelText(/새 마감일/) as HTMLInputElement;
const reasonInput = () => screen.getByLabelText(/조정 사유/) as HTMLTextAreaElement;
const submitButton = () => screen.getByRole('button', { name: '마감일 조정' });

describe('DueDateAdjustDialog', () => {
  it('지금 마감일을 KST 로 채워 두고, 바꾸지 않았거나 사유가 없으면 보낼 수 없다', () => {
    renderDialog();

    expect(dateInput().value).toBe('2026-09-20T18:00');
    expect(submitButton()).toBeDisabled();

    fireEvent.change(reasonInput(), { target: { value: '고객과 일정 협의' } });
    expect(submitButton()).toBeDisabled(); // 날짜가 그대로다

    fireEvent.change(dateInput(), { target: { value: '2026-09-25T10:30' } });
    expect(submitButton()).toBeEnabled();

    fireEvent.change(reasonInput(), { target: { value: '   ' } });
    expect(submitButton()).toBeDisabled(); // 공백 사유
  });

  it('KST 입력을 ISO 순간으로 바꿔 사유와 함께 보내고, 상세 캐시를 갱신한다', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { onOpenChange } = renderDialog(client);

    fireEvent.change(dateInput(), { target: { value: '2026-09-25T10:30' } });
    fireEvent.change(reasonInput(), { target: { value: '  고객과 일정 협의  ' } });
    fireEvent.click(submitButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/srs/sr-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({
      dueDate: '2026-09-25T01:30:00.000Z',
      changeReason: '고객과 일정 협의',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.sr.detail('sr-1') });
  });

  it('서버가 거부하면 이유를 다이얼로그에 남기고 닫지 않는다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: '마감일을 직접 조정할 때는 조정 사유를 입력해야 합니다.' })
    );
    const { onOpenChange } = renderDialog();

    fireEvent.change(dateInput(), { target: { value: '2026-09-25T10:30' } });
    fireEvent.change(reasonInput(), { target: { value: '사유' } });
    fireEvent.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '마감일을 직접 조정할 때는 조정 사유를 입력해야 합니다.'
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('SRDueDateField', () => {
  const baseProps = {
    dueDate: CURRENT_DUE,
    dueDateManual: false,
    status: 'IN_PROGRESS',
    canAdjust: false,
    onAdjust: vi.fn(),
  };

  it('저장된 마감일을 KST 날짜·시각으로 보여 준다', () => {
    render(<SRDueDateField {...baseProps} />);

    expect(screen.getByTestId('sr-due-date')).toHaveTextContent('18:00');
    expect(screen.getByTestId('sr-due-date')).toHaveTextContent('09');
  });

  it('직접 지정한 마감일에는 그 사실을 표시한다', () => {
    const { rerender } = render(<SRDueDateField {...baseProps} />);
    expect(screen.queryByText('직접 지정')).not.toBeInTheDocument();

    rerender(<SRDueDateField {...baseProps} dueDateManual />);
    expect(screen.getByText('직접 지정')).toBeInTheDocument();
  });

  it('조정할 수 있는 사람에게만 조정 버튼을 보이고, 누르면 알린다', () => {
    const onAdjust = vi.fn();
    const { rerender } = render(<SRDueDateField {...baseProps} onAdjust={onAdjust} />);
    expect(screen.queryByRole('button', { name: '조정' })).not.toBeInTheDocument();

    rerender(<SRDueDateField {...baseProps} canAdjust onAdjust={onAdjust} />);
    fireEvent.click(screen.getByRole('button', { name: '조정' }));
    expect(onAdjust).toHaveBeenCalledTimes(1);
  });

  it('마감일이 아직 없으면 미산정으로 표시한다', () => {
    render(<SRDueDateField {...baseProps} dueDate={null} />);

    expect(screen.getByTestId('sr-due-date')).toHaveTextContent('미산정');
  });
});
