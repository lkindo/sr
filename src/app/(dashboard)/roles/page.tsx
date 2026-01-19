'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { DeleteRoleDialog } from '@/components/roles/DeleteRoleDialog';
import { PermissionBoard } from '@/components/roles/PermissionBoard';
import { RoleDialog } from '@/components/roles/RoleDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

interface RolePermission {
  id: string;
  permission: Permission;
}

interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: RolePermission[];
  _count?: {
    users: number;
  };
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/roles');
      if (!response.ok) throw new Error('Failed to fetch roles');
      const data: Role[] = await response.json();
      // 권한 데이터가 없는 경우 빈 배열로 초기화
      const rolesWithPermissions = data.map((role) => ({
        ...role,
        permissions: role.permissions || [],
      }));
      setRoles(rolesWithPermissions);
    } catch {
      toast({
        title: '오류',
        description: '역할 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleCreateRole = () => {
    setSelectedRole(null);
    setIsRoleDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
    setIsRoleDialogOpen(true);
  };

  const handleManagePermissions = (role: Role) => {
    setSelectedRole(role);
    setIsPermissionDialogOpen(true);
  };

  const handleDeleteRole = (role: Role) => {
    setSelectedRole(role);
    setIsDeleteDialogOpen(true);
  };

  const handleRoleSaved = () => {
    fetchRoles();
    setIsRoleDialogOpen(false);
  };

  const handlePermissionsSaved = () => {
    fetchRoles();
    setIsPermissionDialogOpen(false);
  };

  const handleRoleDeleted = () => {
    fetchRoles();
    setIsDeleteDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template bg-white">
        {/* 리스트 헤더 */}
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">역할 목록</h3>
            <Button onClick={handleCreateRole} className="sr-btn-template-primary">
              <Plus className="mr-2 h-4 w-4" />
              등록
            </Button>
          </div>
        </div>

        {/* Total Count - 테이블 바로 위 */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end">
          <div className="text-sm text-muted-foreground">
            Total{' '}
            <span className="font-semibold text-[hsl(var(--sr-primary-dark))]">{roles.length}</span>{' '}
            items
          </div>
        </div>

        {/* 테이블 영역 */}
        <div className="overflow-x-auto">
          <Table className="sr-table-template">
            <TableHeader>
              <TableRow>
                <TableHead>역할 이름</TableHead>
                <TableHead>설명</TableHead>
                <TableHead>권한 수</TableHead>
                <TableHead>사용자 수</TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    등록된 역할이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                roles.map((role) => (
                  <TableRow key={role.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium text-center">{role.name}</TableCell>
                    <TableCell>{role.description || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{role.permissions.length}개</Badge>
                    </TableCell>
                    <TableCell className="text-center">{role._count?.users || 0}명</TableCell>
                    <TableCell className="text-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRole(role)}
                        className="sr-btn-template"
                      >
                        수정
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleManagePermissions(role)}
                        className="sr-btn-template"
                      >
                        권한 관리
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRole(role)}
                        disabled={role._count && role._count.users > 0}
                        className="sr-btn-template"
                      >
                        삭제
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <RoleDialog
        open={isRoleDialogOpen}
        onOpenChange={setIsRoleDialogOpen}
        role={selectedRole}
        onSaved={handleRoleSaved}
      />

      <PermissionBoard
        open={isPermissionDialogOpen}
        onOpenChange={setIsPermissionDialogOpen}
        role={selectedRole}
        onSaved={handlePermissionsSaved}
      />

      <DeleteRoleDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        role={selectedRole}
        onDeleted={handleRoleDeleted}
      />
    </div>
  );
}
