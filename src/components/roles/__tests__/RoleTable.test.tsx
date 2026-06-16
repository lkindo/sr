import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RoleTable } from '../RoleTable';

// Mock UI components
vi.mock('@/components/ui', () => {
  return {
    Badge: ({ children }: any) => <div data-testid="badge">{children}</div>,
    Button: ({ children, onClick, disabled, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    Table: ({ children }: any) => <table>{children}</table>,
    TableHeader: ({ children }: any) => <thead>{children}</thead>,
    TableBody: ({ children }: any) => <tbody>{children}</tbody>,
    TableRow: ({ children }: any) => <tr>{children}</tr>,
    TableHead: ({ children }: any) => <th>{children}</th>,
    TableCell: ({ children }: any) => <td>{children}</td>,
  };
});

describe('RoleTable Component', () => {
  const mockRoles = [
    {
      id: 'r1',
      name: '관리자',
      description: '시스템 전체 관리자',
      permissions: [
        { id: 'p1', permission: {} },
        { id: 'p2', permission: {} },
      ],
      _count: { users: 2 },
    },
    {
      id: 'r2',
      name: '일반사용자',
      description: '일반 회원',
      permissions: [{ id: 'p3', permission: {} }],
      _count: { users: 0 },
    },
  ];

  const defaultProps = {
    roles: [],
    onEdit: vi.fn(),
    onManagePermissions: vi.fn(),
    onDelete: vi.fn(),
  };

  it('roles가 빈 배열일 때 등록된 역할이 없다는 메시지를 렌더링해야 함', () => {
    render(<RoleTable {...defaultProps} />);
    expect(screen.getByText('등록된 역할이 없습니다.')).toBeInTheDocument();
  });

  it('roles 목록을 올바르게 렌더링해야 함', () => {
    render(<RoleTable {...defaultProps} roles={mockRoles} />);

    expect(screen.getByText('관리자')).toBeInTheDocument();
    expect(screen.getByText('시스템 전체 관리자')).toBeInTheDocument();
    expect(screen.getByText('일반사용자')).toBeInTheDocument();
    expect(screen.getByText('일반 회원')).toBeInTheDocument();

    const badges = screen.getAllByTestId('badge');
    expect(badges[0]).toHaveTextContent('2개');
    expect(badges[1]).toHaveTextContent('1개');

    expect(screen.getByText('2명')).toBeInTheDocument();
    expect(screen.getByText('0명')).toBeInTheDocument();
  });

  it('수정 및 권한 관리 버튼 클릭 시 콜백 함수를 올바른 인자값과 함께 호출해야 함', () => {
    const onEdit = vi.fn();
    const onManagePermissions = vi.fn();
    render(
      <RoleTable
        {...defaultProps}
        roles={mockRoles}
        onEdit={onEdit}
        onManagePermissions={onManagePermissions}
      />
    );

    const editButtons = screen.getAllByText('수정');
    fireEvent.click(editButtons[0]);
    expect(onEdit).toHaveBeenCalledWith(mockRoles[0]);

    const permissionButtons = screen.getAllByText('권한 관리');
    fireEvent.click(permissionButtons[1]);
    expect(onManagePermissions).toHaveBeenCalledWith(mockRoles[1]);
  });

  it('사용자 수가 1명 이상인 역할은 삭제 버튼이 비활성화(disabled)되어야 함', () => {
    render(<RoleTable {...defaultProps} roles={mockRoles} />);

    const deleteButtons = screen.getAllByText('삭제');
    expect(deleteButtons[0]).toBeDisabled(); // 관리자 (users: 2) -> disabled
    expect(deleteButtons[1]).not.toBeDisabled(); // 일반사용자 (users: 0) -> enabled
  });

  it('삭제 활성화된 버튼 클릭 시 onDelete 콜백 함수를 호출해야 함', () => {
    const onDelete = vi.fn();
    render(<RoleTable {...defaultProps} roles={mockRoles} onDelete={onDelete} />);

    const deleteButtons = screen.getAllByText('삭제');
    fireEvent.click(deleteButtons[1]); // 일반사용자 클릭
    expect(onDelete).toHaveBeenCalledWith(mockRoles[1]);
  });
});
