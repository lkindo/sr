import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SRListItem } from '@/types/sr.types';

import { SRCardItem, SRTableRow } from '../SRListItem';

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

// Badge/Button 은 렌더 부담을 줄이려 스텁하되, CopyButton 은 이 스위트가 aria-label 과
// 클립보드 호출을 직접 단언하므로 실제 구현을 쓴다.
vi.mock('@/components/ui', async () => {
  const { CopyButton } = await import('@/components/ui/copy-button');
  return {
    CopyButton,
    Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Button: ({
      children,
      asChild,
      ...props
    }: React.ComponentProps<'button'> & { asChild?: boolean }) =>
      asChild && React.isValidElement(children) ? (
        React.cloneElement(children, props as React.HTMLAttributes<HTMLElement>)
      ) : (
        <button {...props}>{children}</button>
      ),
    TableRow: (props: React.ComponentProps<'tr'>) => <tr {...props} />,
    TableCell: (props: React.ComponentProps<'td'>) => <td {...props} />,
  };
});

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

  it('카드 컨테이너를 버튼으로 중첩하지 않고 명시적인 상세 링크를 제공한다', () => {
    render(<SRCardItem sr={mockSR} canManageSRs={true} />);

    const card = screen.getByRole('article');
    expect(card).not.toHaveAttribute('role', 'button');
    expect(card).not.toHaveAttribute('tabindex');
    expect(screen.getByRole('link', { name: 'Test SR' })).toHaveAttribute('href', '/srs/sr-1');
    expect(screen.getByRole('link', { name: '접수' })).toHaveAttribute('href', '/srs/sr-1/intake');
  });

  it('표 행도 포커스 가능한 가짜 버튼이 아니며 제목 링크로 이동한다', () => {
    const { container } = render(
      <table>
        <tbody>
          <SRTableRow sr={mockSR} canManageSRs={false} />
        </tbody>
      </table>
    );

    const row = container.querySelector('tr');
    expect(row).not.toHaveAttribute('tabindex');
    expect(row).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('link', { name: 'Test SR' })).toHaveAttribute('href', '/srs/sr-1');
  });
});

/**
 * 마감 열은 상태를 되풀이하지 않는다(2026-09-18 소유자 결정 D16 2단계). 예전에는 거절된 SR 행에 상태 열 '거절' 과
 * 마감 열 '거절' 이 나란히 빨갛게 나왔다.
 */
describe('SRTableRow — 마감 열', () => {
  it('끝난 SR 은 지난 마감이어도 마감 열에 상태나 지연을 다시 적지 않는다', () => {
    render(
      <table>
        <tbody>
          <SRTableRow
            sr={{ ...mockSR, status: 'REJECTED', dueDate: new Date('2023-01-01') }}
            canManageSRs={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getAllByText('거절')).toHaveLength(1);
    expect(screen.queryByText(/지연/)).not.toBeInTheDocument();
  });

  it('보류 SR 은 상태 이름 없이 지연만 보인다', () => {
    render(
      <table>
        <tbody>
          <SRTableRow
            sr={{
              ...mockSR,
              status: 'ON_HOLD',
              dueDate: new Date(Date.now() - 50 * 60 * 60 * 1000),
            }}
            canManageSRs={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getAllByText('보류')).toHaveLength(1);
    expect(screen.getByText('2일 지연')).toBeInTheDocument();
  });
});
