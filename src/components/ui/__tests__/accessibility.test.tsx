import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect,it } from 'vitest';

import { Dialog, DialogContent, DialogTrigger } from '../dialog';
import { Sheet, SheetContent, SheetTrigger } from '../sheet';
import { Toast, ToastClose, ToastProvider, ToastViewport } from '../toast';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('Accessibility Improvements', () => {
  it('Dialog close button has aria-label "닫기"', () => {
    render(
      <Dialog defaultOpen>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <div>Content</div>
        </DialogContent>
      </Dialog>
    );

    const closeButton = screen.getByLabelText('닫기');
    expect(closeButton).toBeInTheDocument();
  });

  it('Sheet close button has aria-label "닫기"', () => {
    render(
      <Sheet defaultOpen>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <div>Content</div>
        </SheetContent>
      </Sheet>
    );

    const closeButton = screen.getByLabelText('닫기');
    expect(closeButton).toBeInTheDocument();
  });

  it('Toast close button has aria-label "닫기"', () => {
    render(
      <ToastProvider>
        <Toast open={true}>
          <div>Toast Content</div>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>
    );

    const closeButton = screen.getByLabelText('닫기');
    expect(closeButton).toBeInTheDocument();
  });
});
