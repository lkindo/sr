import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRoleAction, updateRoleAction } from '@/actions/role.actions';
import { useToast } from '@/hooks/use-toast';

import { RoleDialog } from '../RoleDialog';

// Mock actions
vi.mock('@/actions/role.actions', () => ({
  createRoleAction: vi.fn(),
  updateRoleAction: vi.fn(),
}));

// Mock use-toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}));

// Mock UI components
vi.mock('@/components/ui', () => {
  const React = require('react');
  return {
    Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <div>{children}</div>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
    Button: ({ children, onClick, disabled, type, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} type={type} {...props}>
        {children}
      </button>
    ),
    Input: React.forwardRef(({ onChange, value, id, ...props }: any, ref: any) => (
      <input ref={ref} id={id} onChange={onChange} value={value} {...props} />
    )),
    Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
  };
});

describe('RoleDialog Component', () => {
  const mockToast = vi.fn();
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    role: null,
    onSaved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToast).mockReturnValue({ toast: mockToast, dismiss: vi.fn(), toasts: [] });
  });

  it('role이 null일 때 "새 역할 추가" 타이틀과 빈 입력 폼을 렌더링해야 함', () => {
    render(<RoleDialog {...defaultProps} />);

    expect(screen.getByText('새 역할 추가')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('예: AUDITOR')).toHaveValue('');
    expect(screen.getByPlaceholderText('역할에 대한 설명을 입력하세요')).toHaveValue('');
  });

  it('role이 존재할 때 "역할 수정" 타이틀과 기존 정보를 입력 폼에 렌더링해야 함', () => {
    const mockRole = { id: 'r1', name: 'SUPPORT', description: 'Support role' };
    render(<RoleDialog {...defaultProps} role={mockRole} />);

    expect(screen.getByText('역할 수정')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('예: AUDITOR')).toHaveValue('SUPPORT');
    expect(screen.getByPlaceholderText('예: AUDITOR')).not.toBeDisabled();
    expect(screen.getByPlaceholderText('역할에 대한 설명을 입력하세요')).toHaveValue(
      'Support role'
    );
  });

  it('기본 역할을 수정할 때는 이름 칸이 잠기고 이유를 보여 준다(헌법 §1.4)', () => {
    render(<RoleDialog {...defaultProps} role={{ id: 'r-mgr', name: 'MANAGER' }} />);

    expect(screen.getByPlaceholderText('예: AUDITOR')).toBeDisabled();
    expect(
      screen.getByText('기본 역할의 이름은 바꿀 수 없습니다. 설명과 권한은 조정할 수 있습니다.')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('역할에 대한 설명을 입력하세요')).not.toBeDisabled();
  });

  it('새 역할을 만들 때는 쓸 수 없는 기본 역할 이름을 알려 준다', () => {
    render(<RoleDialog {...defaultProps} />);

    expect(
      screen.getByText(
        '기본 역할 이름(ADMIN, MANAGER, ENGINEER, CLIENT_ADMIN, CLIENT_USER)은 쓸 수 없습니다.'
      )
    ).toBeInTheDocument();
  });

  it('새 역할 생성 폼 제출 시 createRoleAction을 호출하고 성공하면 onSaved 및 성공 토스트를 노출해야 함', async () => {
    vi.mocked(createRoleAction).mockResolvedValue({
      success: true,
      data: {
        id: 'rnew',
        name: 'NEW_ROLE',
        description: 'Description',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    render(<RoleDialog {...defaultProps} />);

    const nameInput = screen.getByPlaceholderText('예: AUDITOR');
    const descInput = screen.getByPlaceholderText('역할에 대한 설명을 입력하세요');

    fireEvent.change(nameInput, { target: { value: 'NEW_ROLE' } });
    fireEvent.change(descInput, { target: { value: 'Description' } });

    const saveButton = screen.getByText('저장');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(createRoleAction).toHaveBeenCalled();
      // FormData 검증
      const calledFormData = vi.mocked(createRoleAction).mock.calls[0]![0];
      expect(calledFormData.get('name')).toBe('NEW_ROLE');
      expect(calledFormData.get('description')).toBe('Description');

      expect(mockToast).toHaveBeenCalledWith({
        title: '성공',
        description: '역할이 생성되었습니다.',
      });
      expect(defaultProps.onSaved).toHaveBeenCalled();
    });
  });

  it('역할 수정 폼 제출 시 updateRoleAction을 호출하고 성공하면 onSaved 및 성공 토스트를 노출해야 함', async () => {
    // 기본 역할은 이름이 잠긴 채 지금 이름을 그대로 보낸다 — 서버는 같은 이름이면 개명으로 보지 않는다.
    const mockRole = { id: 'r1', name: 'MANAGER', description: 'Manager description' };
    vi.mocked(updateRoleAction).mockResolvedValue({
      success: true,
      data: {
        id: 'r1',
        name: 'MANAGER',
        description: 'Updated description',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    render(<RoleDialog {...defaultProps} role={mockRole} />);

    const descInput = screen.getByPlaceholderText('역할에 대한 설명을 입력하세요');
    fireEvent.change(descInput, { target: { value: 'Updated description' } });

    const saveButton = screen.getByText('저장');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateRoleAction).toHaveBeenCalledWith('r1', expect.any(FormData));
      const calledFormData = vi.mocked(updateRoleAction).mock.calls[0]![1];
      expect(calledFormData.get('name')).toBe('MANAGER');
      expect(calledFormData.get('description')).toBe('Updated description');

      expect(mockToast).toHaveBeenCalledWith({
        title: '성공',
        description: '역할이 수정되었습니다.',
      });
      expect(defaultProps.onSaved).toHaveBeenCalled();
    });
  });

  it('서버 에러 시 에러 토스트를 노출하고 onSaved는 호출되지 않아야 함', async () => {
    vi.mocked(createRoleAction).mockResolvedValue({
      success: false,
      error: '중복된 역할 이름입니다.',
    });

    render(<RoleDialog {...defaultProps} />);

    const nameInput = screen.getByPlaceholderText('예: AUDITOR');
    fireEvent.change(nameInput, { target: { value: 'DUPLICATE' } });

    const saveButton = screen.getByText('저장');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(createRoleAction).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        title: '오류',
        description: '중복된 역할 이름입니다.',
        variant: 'destructive',
      });
      expect(defaultProps.onSaved).not.toHaveBeenCalled();
    });
  });

  it('취소 버튼 클릭 시 onOpenChange(false)가 호출되어야 함', () => {
    const onOpenChange = vi.fn();
    render(<RoleDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const cancelButton = screen.getByText('취소');
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
