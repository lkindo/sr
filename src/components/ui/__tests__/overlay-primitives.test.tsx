import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../context-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

describe('Dialog', () => {
  it('이름·설명·닫기 동작을 제공한다', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>열기</DialogTrigger>
        <DialogContent>
          <DialogTitle>편집</DialogTitle>
          <DialogDescription>사용자 정보를 편집합니다.</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole('button', { name: '열기' }));
    expect(screen.getByRole('dialog', { name: '편집' })).toHaveAccessibleDescription(
      '사용자 정보를 편집합니다.'
    );

    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('DropdownMenu', () => {
  it('트리거로 열고 항목과 체크 상태를 노출한다', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>메뉴</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem inset>수정</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>알림</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(screen.getByRole('button', { name: '메뉴' }));

    expect(screen.getByRole('menuitem', { name: '수정' })).toHaveClass('pl-8');
    expect(screen.getByRole('menuitemcheckbox', { name: '알림' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});

describe('Popover', () => {
  it('트리거 클릭으로 포털 콘텐츠를 열고 기본 배치를 적용한다', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>도움말</PopoverTrigger>
        <PopoverContent>상세 도움말</PopoverContent>
      </Popover>
    );

    await user.click(screen.getByRole('button', { name: '도움말' }));

    expect(screen.getByText('상세 도움말')).toHaveClass('w-72', 'bg-popover');
  });
});

describe('ContextMenu', () => {
  it('우클릭으로 열고 메뉴 항목 상태를 노출한다', async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>대상 행</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem inset>열기</ContextMenuItem>
          <ContextMenuCheckboxItem checked>고정</ContextMenuCheckboxItem>
        </ContextMenuContent>
      </ContextMenu>
    );

    fireEvent.contextMenu(screen.getByText('대상 행'));

    expect(await screen.findByRole('menuitem', { name: '열기' })).toHaveClass('pl-8');
    expect(screen.getByRole('menuitemcheckbox', { name: '고정' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});
