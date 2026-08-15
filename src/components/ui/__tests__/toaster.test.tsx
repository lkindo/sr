import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ toasts: [] as Array<Record<string, unknown>> }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toasts: mocks.toasts }) }));

vi.mock('@/components/ui/toast', async () => {
  const ReactModule = await import('react');
  const component = (tag: string) =>
    ReactModule.forwardRef<HTMLElement, { children?: React.ReactNode; [key: string]: unknown }>(
      ({ children, ...props }, ref) =>
        ReactModule.createElement(tag, { ...props, ref }, children as React.ReactNode)
    );

  return {
    ToastProvider: component('section'),
    Toast: component('article'),
    ToastTitle: component('h2'),
    ToastDescription: component('p'),
    ToastClose: () => <button aria-label="닫기" />,
    ToastViewport: component('div'),
  };
});

import { Toaster } from '../toaster';

beforeEach(() => {
  mocks.toasts = [];
});

describe('Toaster', () => {
  it('파괴적 알림은 foreground, 일반 알림은 background로 안내한다', () => {
    mocks.toasts = [
      { id: 'error', title: '실패', description: '저장 실패', variant: 'destructive', open: true },
      { id: 'ok', title: '완료', description: '저장됨', open: true },
    ];

    render(<Toaster />);

    expect(screen.getByText('실패').closest('article')).toHaveAttribute('type', 'foreground');
    expect(screen.getByText('완료').closest('article')).toHaveAttribute('type', 'background');
  });

  it('제목·설명·액션의 선택 분기를 각각 렌더링한다', () => {
    mocks.toasts = [
      { id: 'action', action: <button>재시도</button>, open: true },
      { id: 'empty', open: true },
    ];

    render(<Toaster />);

    expect(screen.getByRole('button', { name: '재시도' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '닫기' })).toHaveLength(2);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByText('저장됨')).not.toBeInTheDocument();
  });
});
