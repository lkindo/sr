'use client';

import { ResponsiveTableShell } from '@/components/common/ResponsiveTableShell';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { isCanonicalRole, isImmutableRole } from '@/lib/role-rules';
import { RoleItem as Role } from '@/types/role';

interface RoleTableProps {
  roles: Role[];
  onEdit: (role: Role) => void;
  onManagePermissions: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export function RoleTable({ roles, onEdit, onManagePermissions, onDelete }: RoleTableProps) {
  return (
    <ResponsiveTableShell>
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
                {/* ADMIN 역할은 설명·권한까지 서버가 거부한다 — 눌러도 403 인 버튼을 두지 않는다 */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(role)}
                  disabled={isImmutableRole(role.name)}
                  className="sr-btn-template"
                >
                  수정
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onManagePermissions(role)}
                  disabled={isImmutableRole(role.name)}
                  className="sr-btn-template"
                >
                  권한 관리
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(role)}
                  disabled={isCanonicalRole(role.name) || (role._count && role._count.users > 0)}
                  className="sr-btn-template"
                >
                  삭제
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </ResponsiveTableShell>
  );
}
