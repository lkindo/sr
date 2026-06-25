'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Shield, X } from 'lucide-react';

import { getAllPermissionsAction } from '@/actions/permission.actions';
import { updateRolePermissionsAction } from '@/actions/role.actions';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
import { Switch } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  permissions: RolePermission[];
}

interface PermissionBoardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onSaved: () => void;
}

export function PermissionBoard({ open, onOpenChange, role, onSaved }: PermissionBoardProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // 권한 목록 불러오기
  useEffect(() => {
    if (open) {
      const fetchPermissions = async () => {
        try {
          const result = await getAllPermissionsAction();
          if (result.success) {
            setAllPermissions(result.data as Permission[]);
          } else {
            throw new Error(result.error || '권한 목록 로딩 실패');
          }
        } catch {
          toast({
            title: '오류',
            description: '권한 데이터를 불러오지 못했습니다.',
            variant: 'destructive',
          });
        }
      };
      fetchPermissions();
    }
  }, [open, toast]);

  // 역할 선택 시 초기 선택값 설정
  useEffect(() => {
    if (role) {
      setSelectedIds(new Set(role.permissions.map((p) => p.permission.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [role]);

  // 저장 처리
  const handleSave = async () => {
    if (!role) return;
    setLoading(true);
    try {
      const result = await updateRolePermissionsAction(role.id, Array.from(selectedIds));
      if (result.success) {
        toast({ title: '성공', description: '권한 설정이 저장되었습니다.' });
        onSaved();
        onOpenChange(false);
      } else {
        throw new Error(result.error);
      }
    } catch {
      toast({
        title: '오류',
        description: '권한 저장 중 문제가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 데이터 그룹화 및 필터링
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};

    allPermissions.forEach((p) => {
      if (
        searchQuery &&
        !p.resource.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.action.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return;
      }

      if (!groups[p.resource]) groups[p.resource] = [];
      groups[p.resource].push(p);
    });

    return groups;
  }, [allPermissions, searchQuery]);

  const togglePermission = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleGroup = (permissions: Permission[]) => {
    const next = new Set(selectedIds);
    const allSelected = permissions.every((p) => next.has(p.id));

    if (allSelected) {
      permissions.forEach((p) => next.delete(p.id));
    } else {
      permissions.forEach((p) => next.add(p.id));
    }
    setSelectedIds(next);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    inputRef.current?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-card shrink-0 z-10">
          <DialogTitle className="text-xl">권한 설정 - {role?.name}</DialogTitle>
          <DialogDescription>
            리소스별 권한을 설정하세요. 우측 스위치로 그룹 전체를 제어할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {/* 툴바 영역 */}
        <div className="px-6 py-3 bg-card/50 border-b flex items-center justify-between shrink-0">
          <div className="relative w-72">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="리소스 또는 권한 검색..."
              className="pl-8 pr-8 h-9 bg-card"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full p-0.5"
                aria-label="검색어 초기화"
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Badge variant="secondary" className="h-7 px-3">
            {selectedIds.size} / {allPermissions.length} 선택됨
          </Badge>
        </div>

        {/* 스크롤 가능한 컨텐츠 영역 */}
        <div className="flex-1 overflow-y-auto p-6 bg-card/30">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {Object.entries(groupedPermissions).map(([resource, permissions]) => {
              const isAllSelected = permissions.every((p) => selectedIds.has(p.id));
              const isPartiallySelected =
                permissions.some((p) => selectedIds.has(p.id)) && !isAllSelected;

              return (
                <Card
                  key={resource}
                  className="shadow-sm hover:shadow-md transition-all duration-200 border-l-4 border-l-transparent hover:border-l-primary h-fit"
                >
                  <CardHeader className="pb-3 bg-card border-b px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-base font-bold capitalize text-foreground">
                          {resource}
                        </CardTitle>
                      </div>
                      <Switch
                        checked={isAllSelected}
                        onCheckedChange={() => toggleGroup(permissions)}
                        className={cn(
                          'data-[state=checked]:bg-primary scale-90',
                          isPartiallySelected &&
                            'data-[state=unchecked]:bg-primary/60 data-[state=unchecked]:border-primary/60'
                        )}
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="pt-3 pb-3 px-4 space-y-3 bg-card">
                    {permissions.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between group hover:bg-muted -mx-2 px-2 py-1.5 rounded-md transition-colors"
                      >
                        <div className="flex flex-col gap-0.5">
                          <Label
                            htmlFor={p.id}
                            className="font-medium text-sm cursor-pointer text-foreground/80 group-hover:text-primary transition-colors"
                          >
                            {p.action}
                          </Label>
                          {p.description && (
                            <span className="text-[11px] text-muted-foreground leading-tight">
                              {p.description}
                            </span>
                          )}
                        </div>
                        <Switch
                          id={p.id}
                          checked={selectedIds.has(p.id)}
                          onCheckedChange={() => togglePermission(p.id)}
                          className="scale-75"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}

            {Object.keys(groupedPermissions).length === 0 && (
              <div className="col-span-full text-center py-20 text-muted-foreground">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* 하단 고정 버튼 영역 */}
        <DialogFooter className="px-6 py-4 border-t bg-card shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={loading} className="min-w-[100px]">
            {loading ? '저장 중...' : '변경사항 저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
