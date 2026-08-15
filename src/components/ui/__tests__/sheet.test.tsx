import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../sheet';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Sheet', () => {
  const cases = [
    ['top', 'top-0', 'border-b'],
    ['bottom', 'bottom-0', 'border-t'],
    ['left', 'left-0', 'border-r'],
    ['right', 'right-0', 'border-l'],
  ] as const;

  it.each(cases)('%s 방향 클래스를 적용한다', (side, position, border) => {
    render(
      <Sheet defaultOpen>
        <SheetContent side={side}>
          <SheetTitle>설정 패널</SheetTitle>
          <SheetDescription>설정을 바꿉니다.</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    const sheet = screen.getByRole('dialog', { name: '설정 패널' });
    expect(sheet).toHaveClass(position, border);
    expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  });
});
