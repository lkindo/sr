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
    <div className="md:hidden space-y-3 px-3 pb-4">
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
            <div className="p-3.5 space-y-2">
              {/* Header: Name & User Count */}
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-base text-[hsl(var(--sr-primary-dark))] truncate">
                    {role.name}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {role.description || '설명 없음'}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px] h-5 px-1.5">
                  사용자 {role._count?.users || 0}명
                </Badge>
              </div>

              {/* Permission Stat */}
              <div className="flex items-center gap-1.5 text-[11px] leading-relaxed">
                <span className="text-muted-foreground font-medium shrink-0">보유 권한</span>
                <span className="text-foreground font-bold">{role.permissions.length}개</span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => onEdit(role)}
                >
                  수정
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => onManagePermissions(role)}
                >
                  권한
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs hover:text-destructive hover:bg-destructive/10"
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
