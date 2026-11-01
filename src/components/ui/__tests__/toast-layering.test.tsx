import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';

const zIndexOf = (element: Element) => Number(/z-\[(\d+)\]/.exec(element.className)?.[1] ?? 0);

describe('토스트와 다이얼로그의 쌓임 순서', () => {
  // 같은 값이면 나중에 붙는 다이얼로그 포털이 토스트를 덮어, 저장 실패가 무반응처럼 보인다.
  it('토스트가 다이얼로그 오버레이와 본문보다 위에 놓인다', () => {
    render(
      <ToastProvider>
        <ToastViewport data-testid="toast-viewport" />
        <Dialog open>
          <DialogContent>
            <DialogTitle>제목</DialogTitle>
            <DialogDescription>설명</DialogDescription>
          </DialogContent>
        </Dialog>
      </ToastProvider>
    );

    const viewport = screen.getByTestId('toast-viewport');
    const content = screen.getByRole('dialog');
    const overlay = content.previousElementSibling as Element;

    expect(zIndexOf(viewport)).toBeGreaterThan(zIndexOf(overlay));
    expect(zIndexOf(viewport)).toBeGreaterThan(zIndexOf(content));
  });
});
