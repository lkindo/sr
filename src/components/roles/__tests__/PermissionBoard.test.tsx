import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllPermissionsAction } from '@/actions/permission.actions';

import { PermissionBoard } from '../PermissionBoard';

// Mock dependencies
vi.mock('@/actions/permission.actions', () => ({
  getAllPermissionsAction: vi.fn(),
}));

vi.mock('@/actions/role.actions', () => ({
  updateRolePermissionsAction: vi.fn(),
}));

// Mock hooks
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Search: () => <div data-testid="icon-search" />,
    Shield: () => <div data-testid="icon-shield" />,
    X: () => <div data-testid="icon-x" />,
  };
});

// Mock UI components
vi.mock('@/components/ui', () => {
  const React = require('react');
  return {
    Badge: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Button: ({ children, onClick, ...props }: React.ComponentProps<'button'>) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Card: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
    CardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    CardHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    CardTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
      open ? <div>{children}</div> : null,
    DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Input: React.forwardRef(
      ({ onChange, value, ...props }: React.ComponentProps<'input'>, ref: never) => (
        <input ref={ref} onChange={onChange} value={value} {...props} />
      )
    ),
    Label: ({ children, htmlFor }: React.ComponentProps<'label'>) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
    Switch: ({ checked, onCheckedChange, ...props }: any) => (
      <button
        onClick={() => onCheckedChange(!checked)}
        aria-checked={checked}
        role="switch"
        {...props}
      />
    ),
  };
});

describe('PermissionBoard Search Component', () => {
  const mockPermissions = [
    { id: 'p1', resource: 'users', action: 'read', description: 'Read users' },
    { id: 'p2', resource: 'users', action: 'write', description: 'Write users' },
    { id: 'p3', resource: 'roles', action: 'read', description: 'Read roles' },
  ];

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    role: { id: 'r1', name: 'Admin', permissions: [] },
    onSaved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAllPermissionsAction).mockResolvedValue({
      success: true,
      data: mockPermissions,
    });
  });

  it('renders search input', async () => {
    render(<PermissionBoard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('리소스 또는 권한 검색...')).toBeInTheDocument();
    });
  });

  it('shows clear button when text is typed', async () => {
    render(<PermissionBoard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('리소스 또는 권한 검색...')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('리소스 또는 권한 검색...');

    // Initially no clear button
    expect(screen.queryByLabelText('검색어 초기화')).not.toBeInTheDocument();

    // Type something
    fireEvent.change(input, { target: { value: 'users' } });

    // Clear button should appear (This will fail until implemented)
    expect(screen.getByLabelText('검색어 초기화')).toBeInTheDocument();
  });

  it('clears input when clear button is clicked', async () => {
    render(<PermissionBoard {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('리소스 또는 권한 검색...')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('리소스 또는 권한 검색...');

    fireEvent.change(input, { target: { value: 'users' } });
    const clearBtn = screen.getByLabelText('검색어 초기화');

    fireEvent.click(clearBtn);

    expect(input).toHaveValue('');
    expect(screen.queryByLabelText('검색어 초기화')).not.toBeInTheDocument();
  });
});
