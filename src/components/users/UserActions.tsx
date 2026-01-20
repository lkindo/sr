'use client';

import { useSession } from 'next-auth/react';
import { Shield, UserCheck, UserX } from 'lucide-react';

import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { User } from '@/types/user'; // Using shared type if available, otherwise defining minimal interface

interface UserActionsProps {
  user: any; // Using any for now to match page.tsx usage until types are unified
  onAssignRoles: (user: any) => void;
  onToggleActive: (userId: string, isActive: boolean) => void;
  onDelete: (user: any) => void;
  variant?: 'table' | 'card'; // To adjust styling slightly if needed
}

export function UserActions({
  user,
  onAssignRoles,
  onToggleActive,
  onDelete,
  variant = 'table',
}: UserActionsProps) {
  const { data: session, update } = useSession();
  const { toast } = useToast();

  const handleRoleAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await update();
    const currentRoles = session?.user?.roles || [];
    if (!currentRoles.includes('ADMIN')) {
      toast({
        title: '권한 없음',
        description: `역할 관리 권한이 없습니다. 현재 역할: ${currentRoles.join(', ') || '없음'}`,
        variant: 'destructive',
      });
      return;
    }
    onAssignRoles(user);
  };

  const handleActiveAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await update();
    const currentRoles = session?.user?.roles || [];
    const hasPermission = currentRoles.includes('ADMIN') || currentRoles.includes('MANAGER');

    if (!hasPermission) {
      toast({
        title: '권한 없음',
        description: `사용자 활성화/비활성화 권한이 없습니다. 현재 역할: ${currentRoles.join(', ') || '없음'}`,
        variant: 'destructive',
      });
      return;
    }
    onToggleActive(user.id, user.isActive);
  };

  const handleDeleteAction = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await update();
    const currentRoles = session?.user?.roles || [];
    if (!currentRoles.includes('ADMIN')) {
      toast({
        title: '권한 없음',
        description: `사용자 삭제 권한이 없습니다. 현재 역할: ${currentRoles.join(', ') || '없음'}`,
        variant: 'destructive',
      });
      return;
    }

    // Check if user is trying to delete themselves
    if (session?.user?.id === user.id) {
      toast({
        title: '삭제 불가',
        description: '자신의 계정은 삭제할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    // Check if user has system roles
    const hasSystemRole = user.roles.some((ur: any) => ['ADMIN', 'MANAGER'].includes(ur.role.name));

    if (hasSystemRole) {
      toast({
        title: '삭제 제한',
        description: '시스템 관리자 계정은 삭제할 수 없습니다. 역할을 변경하거나 비활성화하세요.',
        variant: 'destructive',
      });
      return;
    }
    onDelete(user);
  };

  // Styles based on variant
  const buttonBaseClass =
    variant === 'table'
      ? 'text-[hsl(var(--sr-gray-medium))] hover:text-[hsl(var(--sr-primary-dark))] hover:bg-transparent'
      : 'h-8 text-xs'; // Mobile card style

  const deleteButtonBaseClass =
    variant === 'table'
      ? 'text-[hsl(var(--sr-gray-medium))] hover:text-destructive hover:bg-transparent'
      : 'h-8 text-xs hover:text-destructive hover:bg-destructive/10 hover:border-destructive/50';

  if (variant === 'card') {
    return (
      <div className="grid grid-cols-3 gap-2 pt-2">
        <Button variant="outline" size="sm" className={buttonBaseClass} onClick={handleRoleAction}>
          <Shield className="mr-1 h-3 w-3" /> 역할
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={buttonBaseClass}
          onClick={handleActiveAction}
        >
          {user.isActive ? (
            <UserX className="mr-1 h-3 w-3" />
          ) : (
            <UserCheck className="mr-1 h-3 w-3" />
          )}
          {user.isActive ? '비활성' : '활성'}
        </Button>
        <PermissionGuard roles={['ADMIN']}>
          <Button
            variant="outline"
            size="sm"
            className={deleteButtonBaseClass}
            onClick={handleDeleteAction}
          >
            <UserX className="mr-1 h-3 w-3" /> 삭제
          </Button>
        </PermissionGuard>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <Button variant="ghost" size="sm" onClick={handleRoleAction} className={buttonBaseClass}>
        <Shield className="mr-1 h-4 w-4" />
        역할 관리
      </Button>
      <Button variant="ghost" size="sm" onClick={handleActiveAction} className={buttonBaseClass}>
        {user.isActive ? (
          <UserX className="mr-1 h-4 w-4" />
        ) : (
          <UserCheck className="mr-1 h-4 w-4" />
        )}
        {user.isActive ? '비활성화' : '활성화'}
      </Button>
      <PermissionGuard roles={['ADMIN']}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDeleteAction}
          className={deleteButtonBaseClass}
        >
          <UserX className="mr-1 h-4 w-4" />
          삭제
        </Button>
      </PermissionGuard>
    </div>
  );
}
