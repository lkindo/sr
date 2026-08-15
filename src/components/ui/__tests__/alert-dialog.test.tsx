import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../alert-dialog';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function Harness({ onAction }: { onAction?: () => void }) {
  return (
    <AlertDialog defaultOpen>
      <AlertDialogTrigger>삭제 열기</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>사용자 삭제</AlertDialogTitle>
          <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction className="danger-action" onClick={onAction}>
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe('AlertDialog', () => {
  it('alertdialog에 접근 가능한 이름과 설명을 연결한다', () => {
    render(<Harness />);

    const dialog = screen.getByRole('alertdialog', { name: '사용자 삭제' });
    expect(dialog).toHaveAccessibleDescription('이 작업은 되돌릴 수 없습니다.');
  });

  it('액션과 취소 버튼에 공용 Button 스타일을 결합한다', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: '삭제' })).toHaveClass(
      'inline-flex',
      'danger-action'
    );
    expect(screen.getByRole('button', { name: '취소' })).toHaveClass('border', 'bg-background');
  });

  it('열리면 포커스를 내부로 옮기고 Tab 포커스를 대화상자 안에 가둔다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = screen.getByRole('alertdialog');

    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
    const buttons = within(dialog).getAllByRole('button');
    const firstButton = buttons[0]!;
    const lastButton = buttons.at(-1)!;

    lastButton.focus();
    await user.tab();
    expect(document.activeElement).toBe(firstButton);
  });

  it('Escape는 파괴적 작업을 실행하지 않고 대화상자만 닫는다', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onAction).not.toHaveBeenCalled();
  });
});
