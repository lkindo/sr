'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: { id: string; permission: any }[];
  _count?: {
    users: number;
  };
}

interface RoleMobileListProps {
  roles: Role[];
  onEdit: (role: Role) => void;
  onManagePermissions: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export function RoleMobileList({
  roles,
  onEdit,
  onManagePermissions,
  onDelete,
}: RoleMobileListProps) {
  return (
    <div className="md:hidden space-y-4 px-4 pb-4">
      {roles.length === 0 ? (
        <div className="text-center py-12 border rounded-md border-dashed">
          <p className="text-muted-foreground">등록된 역할이 없습니다.</p>
        </div>
      ) : (
        roles.map((role) => (
          <div
            key={role.id}
            className="border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden"
          >
            <div className="p-4 space-y-3">
              {/* Header: Name & User Count */}
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-lg text-[hsl(var(--sr-primary-dark))]">
                    {role.name}
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1 text-xs">
                    {role.description || '설명 없음'}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  사용자 {role._count?.users || 0}명
                </Badge>
              </div>

              {/* Permission Stat */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm text-muted-foreground">보유 권한:</span>
                <Badge variant="outline">{role.permissions.length}개</Badge>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-2 pt-2 mt-2 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => onEdit(role)}
                >
                  수정
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => onManagePermissions(role)}
                >
                  권한 관리
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs hover:text-destructive hover:bg-destructive/10 hover:border-destructive/50"
                  onClick={() => onDelete(role)}
                  disabled={role._count && role._count.users > 0}
                >
                  삭제
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
