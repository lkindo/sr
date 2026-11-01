import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Toast, ToastClose, ToastProvider, ToastTitle, ToastViewport } from '@/components/ui/toast';

const zIndexOf = (element: Element) => Number(/z-\[(\d+)\]/.exec(element.className)?.[1] ?? 0);

function Screen({ dialogOpen, onToastClose }: { dialogOpen: boolean; onToastClose?: () => void }) {
  return (
    <ToastProvider>
      <Toast open onOpenChange={(open) => !open && onToastClose?.()}>
        <ToastTitle>저장 실패</ToastTitle>
        <ToastClose aria-label="닫기" />
      </Toast>
      <ToastViewport data-testid="toast-viewport" />
      <Dialog open={dialogOpen}>
        <DialogContent>
          <DialogTitle>제목</DialogTitle>
          <DialogDescription>설명</DialogDescription>
        </DialogContent>
      </Dialog>
    </ToastProvider>
  );
}

describe('토스트와 다이얼로그의 쌓임 순서', () => {
  // jsdom 에는 포인터 캡처가 없다. Radix 토스트가 스와이프 판정에 호출한다.
  beforeAll(() => {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => undefined;
  });

  // 같은 값이면 나중에 붙는 다이얼로그 포털이 토스트를 덮어, 저장 실패가 무반응처럼 보인다.
  it('토스트가 다이얼로그 오버레이와 본문보다 위에 놓인다', () => {
    render(<Screen dialogOpen />);

    const viewport = screen.getByTestId('toast-viewport');
    const content = screen.getByRole('dialog');
    const overlay = content.previousElementSibling as Element;

    expect(zIndexOf(viewport)).toBeGreaterThan(zIndexOf(overlay));
    expect(zIndexOf(viewport)).toBeGreaterThan(zIndexOf(content));
  });

  // 위에 보여도 모달이 건 pointer-events: none 이 남으면 닫을 수 없다. user-event 가 이를 검사한다.
  it('토스트가 뜬 뒤 다이얼로그가 열려도 닫기 버튼을 누를 수 있다', async () => {
    const onToastClose = vi.fn();
    const { rerender } = render(<Screen dialogOpen={false} onToastClose={onToastClose} />);
    rerender(<Screen dialogOpen onToastClose={onToastClose} />);

    const close = screen.getByText('저장 실패').closest('li')!.querySelector('button')!;
    await userEvent.setup({ pointerEventsCheck: 1 }).click(close);

    expect(onToastClose).toHaveBeenCalled();
  });
});
