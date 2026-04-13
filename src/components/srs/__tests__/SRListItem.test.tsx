import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SRListItem } from '@/types/sr.types';

import { SRCardItem } from '../SRListItem';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: React.MouseEventHandler;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

vi.mock('@/components/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock SR data
const mockSR: SRListItem = {
  id: 'sr-1',
  srNumber: 'SR-2023-0001',
  title: 'Test SR',
  status: 'REQUESTED',
  priority: 'HIGH',
  createdAt: new Date(),
  dueDate: null,
  completedAt: null,
  clientId: 'c1',
  requesterId: 'u1',
  assigneeId: 'u2',
  serviceCategoryId: 'sc1',
  client: { id: 'c1', name: 'Test Client' },
  requester: { id: 'u1', name: 'Requester', email: 'req@example.com' },
  assignee: { id: 'u2', name: 'Assignee', email: 'assignee@example.com' },
  serviceCategory: {
    id: 'sc1',
    categoryName: 'Category',
    priority: 'HIGH',
    slaHours: 24,
    handlerId: null,
    handler: null,
  },
  _count: { comments: 0, attachments: 0 },
};

describe('SRCardItem', () => {
  it('renders SR number and copy button', () => {
    render(<SRCardItem sr={mockSR} canManageSRs={true} />);

    expect(screen.getByText('SR-2023-0001')).toBeInTheDocument();

    const copyButton = screen.getByLabelText('SR-2023-0001 번호 복사');
    expect(copyButton).toBeInTheDocument();

    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('SR-2023-0001');
  });
});
