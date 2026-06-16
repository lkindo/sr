import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RoleMobileList } from '../RoleMobileList';

// Mock UI components
vi.mock('@/components/ui', () => {
  return {
    Badge: ({ children, className }: any) => (
      <div data-testid="badge" className={className}>
        {children}
      </div>
    ),
    Button: ({ children, onClick, disabled, className, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} className={className} {...props}>
        {children}
      </button>
    ),
  };
});

describe('RoleMobileList Component', () => {
  const mockRoles = [
    {
      id: 'r1',
      name: '운영자',
      description: '시스템 운영자',
      permissions: [{ id: 'p1', permission: {} }],
      _count: { users: 5 },
    },
    {
      id: 'r2',
      name: '게스트',
      permissions: [],
      _count: { users: 0 },
    },
  ];

  const defaultProps = {
    roles: [],
    onEdit: vi.fn(),
    onManagePermissions: vi.fn(),
    onDelete: vi.fn(),
  };

  it('roles가 빈 배열일 때 등록된 역할이 없다는 문구를 노출해야 함', () => {
    render(<RoleMobileList {...defaultProps} />);
    expect(screen.getByText('등록된 역할이 없습니다.')).toBeInTheDocument();
  });

  it('roles 정보를 모바일 카드 형태로 올바르게 렌더링해야 함', () => {
    render(<RoleMobileList {...defaultProps} roles={mockRoles} />);

    expect(screen.getByText('운영자')).toBeInTheDocument();
    expect(screen.getByText('시스템 운영자')).toBeInTheDocument();
    expect(screen.getByText('게스트')).toBeInTheDocument();
    expect(screen.getByText('설명 없음')).toBeInTheDocument(); // description이 없는 경우

    const badges = screen.getAllByTestId('badge');
    expect(badges[0]).toHaveTextContent('사용자 5명');
    expect(badges[1]).toHaveTextContent('사용자 0명');

    expect(screen.getByText('1개')).toBeInTheDocument();
    expect(screen.getByText('0개')).toBeInTheDocument();
  });

  it('각 버튼 클릭 시 올바른 콜백 함수가 호출되어야 함', () => {
    const onEdit = vi.fn();
    const onManagePermissions = vi.fn();
    const onDelete = vi.fn();

    render(
      <RoleMobileList
        {...defaultProps}
        roles={mockRoles}
        onEdit={onEdit}
        onManagePermissions={onManagePermissions}
        onDelete={onDelete}
      />
    );

    const editButtons = screen.getAllByText('수정');
    fireEvent.click(editButtons[0]);
    expect(onEdit).toHaveBeenCalledWith(mockRoles[0]);

    const permButtons = screen.getAllByText('권한');
    fireEvent.click(permButtons[1]);
    expect(onManagePermissions).toHaveBeenCalledWith(mockRoles[1]);

    const deleteButtons = screen.getAllByText('삭제');
    fireEvent.click(deleteButtons[1]);
    expect(onDelete).toHaveBeenCalledWith(mockRoles[1]);
  });

  it('사용자가 배정된 역할(users > 0)은 삭제 버튼이 비활성화되어야 함', () => {
    render(<RoleMobileList {...defaultProps} roles={mockRoles} />);

    const deleteButtons = screen.getAllByText('삭제');
    expect(deleteButtons[0]).toBeDisabled(); // 운영자 (users: 5)
    expect(deleteButtons[1]).not.toBeDisabled(); // 게스트 (users: 0)
  });
});
