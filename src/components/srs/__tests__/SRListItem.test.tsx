import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SRTableRow, SRCardItem } from '../SRListItem';
import { SRListItem } from '@/types/sr.types';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock Link
vi.mock('next/link', () => ({
  default: ({ children, href, onClick }: any) => (
    <a href={href} onClick={onClick} data-testid="mock-link">
      {children}
    </a>
  ),
}));

// Mock Badge and Button components
vi.mock('@/components/ui', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="mock-badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  TableCell: ({ children, className, onClick, title }: any) => (
    <td className={className} onClick={onClick} title={title}>
      {children}
    </td>
  ),
  TableRow: ({ children, className, onClick }: any) => (
    <tr className={className} onClick={onClick}>
      {children}
    </tr>
  ),
}));

// Mock icons
vi.mock('lucide-react', () => ({
  Clock: () => <span data-testid="icon-clock" />,
}));

const mockSR: SRListItem = {
  id: 'sr-123',
  srNumber: 'SR-2023-001',
  title: 'Test Issue',
  status: 'REQUESTED',
  priority: 'HIGH',
  dueDate: new Date(),
  createdAt: new Date(),
  completedAt: null,
  clientId: 'client-1',
  requesterId: 'user-1',
  assigneeId: null,
  serviceCategoryId: 'cat-1',
  client: { id: 'client-1', name: 'Test Client' },
  requester: { id: 'user-1', name: 'Requester Name', email: 'req@test.com' },
  assignee: null,
  serviceCategory: {
    id: 'cat-1',
    categoryName: 'General',
    priority: 'MEDIUM',
    slaHours: 24,
    handlerId: null,
  },
  _count: { comments: 2, attachments: 1 },
};

describe('SRTableRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SR details correctly', () => {
    render(
      <table>
        <tbody>
          <SRTableRow sr={mockSR} isStaff={false} />
        </tbody>
      </table>
    );

    // Wait for the render to complete if async (it's not)
    // Check for text content
    expect(screen.getByText('SR-2023-001')).toBeInTheDocument();
    expect(screen.getByText('Test Issue')).toBeInTheDocument();
    expect(screen.getByText('Test Client')).toBeInTheDocument();
    expect(screen.getByText('Requester Name')).toBeInTheDocument();

    // Check for status and priority labels (from constants)
    // Assuming 'REQUESTED' maps to '요청됨' and 'HIGH' to '높음'
    // If constants are mocked or not available, this might fail.
    // The component imports constants from './constants'. Since we are testing in same dir structure, it should work.
    expect(screen.getByText('요청됨')).toBeInTheDocument();
    expect(screen.getByText('높음')).toBeInTheDocument();

    // Check counts
    expect(screen.getByText('2 / 1')).toBeInTheDocument();
  });

  it('renders intake button for staff when status is REQUESTED', () => {
    render(
      <table>
        <tbody>
          <SRTableRow sr={mockSR} isStaff={true} />
        </tbody>
      </table>
    );

    expect(screen.getByText('접수')).toBeInTheDocument();
  });

  it('does NOT render intake button for non-staff', () => {
    render(
      <table>
        <tbody>
          <SRTableRow sr={mockSR} isStaff={false} />
        </tbody>
      </table>
    );

    expect(screen.queryByText('접수')).not.toBeInTheDocument();
  });
});

describe('SRCardItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SR details correctly in card view', () => {
    render(<SRCardItem sr={mockSR} isStaff={false} />);

    expect(screen.getByText('SR-2023-001')).toBeInTheDocument();
    expect(screen.getByText('Test Issue')).toBeInTheDocument();
    expect(screen.getByText('Test Client')).toBeInTheDocument();
    // Requester name is NOT in SRCardItem JSX, so we don't expect it.

    expect(screen.getByText('요청됨')).toBeInTheDocument();
    expect(screen.getByText('높음')).toBeInTheDocument();
  });

  it('renders intake button for staff', () => {
    render(<SRCardItem sr={mockSR} isStaff={true} />);
    expect(screen.getByText('접수')).toBeInTheDocument();
  });
});
