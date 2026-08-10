'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Search, Shield } from 'lucide-react';

import { Button } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { Input } from '@/components/ui';
import { ScrollArea } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { ApiError, apiGet, apiPost, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

/** 역할 배정 다이얼로그가 요구하는 최소 역할 형태. 유일 공급자인 UsersClient 가 이 타입을 쓴다. */
export interface AssignableRole {
  id: string;
  name: string;
  description: string | null;
}

/**
 * `/api/users/[id]/roles` 가 거절할 때 담아 보내는 필드들.
 *
 * 라우트는 상황에 따라 **서로 다른 조합**을 채운다(역할끼리 충돌 / 고객사 할당과 충돌 /
 * 그 밖의 거절). 아래 onError 의 세 분기가 이 조합을 보고 갈린다.
 */
interface RoleAssignErrorBody {
  error?: string;
  suggestion?: string;
  systemRoles?: string[];
  clientRoles?: string[];
  assignedClients?: Array<{ id: string; name: string }>;
}

/**
 * 빈 목록의 참조를 고정한다.
 *
 * 매 렌더 새 `[]` 를 만들면 아래 `filteredRoles` 의 useMemo 가 매번 다시 계산되고,
 * 카드 그리드 전체가 불필요하게 리렌더된다.
 */
const NO_ROLES: AssignableRole[] = [];

interface User {
  id: string;
  name: string;
  email: string;
  roles: Array<{
    role: {
      id: string;
      name: string;
    };
  }>;
}

interface AssignRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSaved: () => void;
  availableRoles?: AssignableRole[];
}

export function AssignRolesDialog({
  open,
  onOpenChange,
  user,
  onSaved,
  availableRoles,
}: AssignRolesDialogProps) {
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const {
    data: fetchedRoles,
    // ⚠️ `isPending` 이 아니라 `isLoading` 이다. v5 에서 `enabled: false` 인 쿼리도 status 는
    // 'pending' 이라, isPending 을 스피너에 물리면 **조회를 아예 하지 않는 경우**
    // (availableRoles 를 받았거나 다이얼로그가 닫혀 있는 경우) 목록 대신 스피너가 남는다.
    // `isLoading === isPending && isFetching` 이므로 요청이 실제로 떠 있는 첫 로딩에서만 참이고,
    // 재조회 때는 이미 그려진 목록이 그대로 보인다(예전 setLoading(true) 과 같은 자리).
    isLoading: rolesLoading,
    error: rolesError,
  } = useQuery({
    queryKey: qk.roles.all,
    // `/api/roles` 는 봉투 없이 bare 배열을 돌려준다. 그래서 `apiList` 가 아니라 `apiGet` 이다.
    queryFn: () => apiGet<AssignableRole[]>('/api/roles'),
    // 예전에는 fetchRoles 첫 줄의 `if (availableRoles) return` 과 effect 의 `if (open)` 이
    // 조회 여부를 정했다. 두 조건이 그대로 `enabled` 가 된다 — 공급자가 목록을 주면 네트워크를
    // 타지 않고, 닫혀 있는 다이얼로그는 조회하지 않는다.
    enabled: open && !availableRoles,
    // 403 은 다시 물어봐도 403 이다. 전역 기본값 `retry: 1` 이면 실패 토스트가 한 박자 늦는다.
    retry: retryUnlessClientError,
    // 목록은 항상 신선해야 한다. 전역 staleTime 60초를 그대로 두면 방금 만든 역할이
    // 이 다이얼로그에서만 안 보이는 상태가 생긴다.
    staleTime: 0,
  });

  /**
   * 화면에 그릴 역할 목록.
   *
   * 예전에는 state 하나에 두 출처(prop, 조회 결과)를 effect 로 흘려 넣었지만, 승자는 원래부터
   * "availableRoles 가 있으면 그것" 이었다. 그 규칙을 그대로 식(式)으로 적는다.
   */
  const roles = availableRoles ?? fetchedRoles ?? NO_ROLES;

  /**
   * 조회 실패는 토스트로만 알린다.
   *
   * 실패해도 목록은 빈 채로 두고 다이얼로그는 평소대로 그린다 — 예전 catch 블록의 계약
   * 그대로다(useQuery 의 error 를 화면에 노출하면 회귀). v5 의 useQuery 에는 onError 가 없어
   * effect 로 옮겼다. `error` 는 실패마다 새 객체이므로 실패 1회당 정확히 한 번 실행된다.
   */
  useEffect(() => {
    if (!rolesError) return;
    toast({
      title: '오류',
      description: '역할 목록을 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
  }, [rolesError, toast]);

  useEffect(() => {
    if (open) {
      if (user) {
        setSelectedRoleIds(user.roles.map((ur) => ur.role.id));
      }
      setSearchQuery('');
    }
  }, [open, user]);

  const handleToggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const assignRoles = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: string[] }) =>
      // fallbackMessage 는 서버가 `error` 를 주지 않았을 때 쓰던 기존 문구와 같다.
      apiPost(
        `/api/users/${userId}/roles`,
        { roleIds },
        { fallbackMessage: 'Failed to assign roles' }
      ),
    onSuccess: () => {
      toast({
        title: '성공',
        description: '역할이 성공적으로 할당되었습니다.',
      });

      onSaved();
      onOpenChange(false);
    },
    onError: (error) => {
      /**
       * ⚠️ 이 라우트는 거절 사유를 본문에 담아 보내고, 그 **형태가 세 가지**다. 하나로 뭉치면
       * 관리자는 "저장이 안 된다" 만 보고 무엇을 고쳐야 하는지 알 수 없다. `ApiError.body` 가
       * 파싱된 본문을 그대로 들고 있으므로 분기 조건은 예전 `await response.json()` 때와 같다.
       * (네트워크 오류처럼 ApiError 가 아닌 실패는 body 가 없어 3번으로 떨어진다.)
       */
      const body = (error instanceof ApiError ? error.body : undefined) as
        RoleAssignErrorBody | undefined;
      const systemRoles = body?.systemRoles;
      const clientRoles = body?.clientRoles;
      const assignedClients = body?.assignedClients;

      // 1. 시스템 운영팀 + 고객사 팀 역할 동시 할당 에러
      if (systemRoles && clientRoles) {
        toast({
          title: '역할 충돌',
          description: (
            <div className="space-y-2">
              <p>{body?.error}</p>
              <p className="text-sm">
                <strong>시스템 운영팀:</strong> {systemRoles.join(', ')}
              </p>
              <p className="text-sm">
                <strong>고객사 팀:</strong> {clientRoles.join(', ')}
              </p>
              <p className="text-sm text-muted-foreground">{body?.suggestion}</p>
            </div>
          ),
          variant: 'destructive',
          duration: 8000,
        });
        return;
      }

      // 2. 시스템 운영팀 역할 + 고객사 할당 충돌 에러 처리
      if (assignedClients && assignedClients.length > 0) {
        const clientNames = assignedClients.map((c) => c.name).join(', ');
        toast({
          title: '역할 할당 제한',
          description: (
            <div className="space-y-2">
              <p>{body?.error}</p>
              <p className="text-sm">
                <strong>할당된 고객사:</strong> {clientNames}
              </p>
              <p className="text-sm text-muted-foreground">{body?.suggestion}</p>
            </div>
          ),
          variant: 'destructive',
          duration: 8000,
        });
        return;
      }

      // 3. 그 밖의 거절과 네트워크 오류. ApiError 의 message 는 서버가 준 `error` 값이고,
      //    없으면 위 fallbackMessage 다 — 예전 `throw new Error(error.error || ...)` 와 같다.
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '역할 할당에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!user) return;

    assignRoles.mutate({ userId: user.id, roleIds: selectedRoleIds });
  };

  // 검색 필터링
  const filteredRoles = useMemo(() => {
    if (!searchQuery) return roles;
    return roles.filter((role) => role.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [roles, searchQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            역할 할당
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{user?.name}</span>님에게 부여할 역할을
            선택하세요.
          </DialogDescription>
        </DialogHeader>

        {/* 검색 영역 */}
        <div className="px-6 py-3 bg-card/50 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="역할 검색..."
              className="pl-8 bg-card"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 역할 리스트 (카드형) */}
        <ScrollArea className="flex-1 p-6 bg-card/30">
          {rolesLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredRoles.map((role) => {
                const isSelected = selectedRoleIds.includes(role.id);
                return (
                  <div
                    key={role.id}
                    onClick={() => handleToggleRole(role.id)}
                    className={cn(
                      'cursor-pointer rounded-lg border p-4 transition-all duration-200 hover:shadow-md relative overflow-hidden bg-card',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:border-primary/50'
                    )}
                  >
                    {/* 선택 표시 아이콘 */}
                    {isSelected && (
                      <div className="absolute top-0 right-0 bg-primary text-white p-1 rounded-bl-lg shadow-sm">
                        <Check className="w-3 h-3" />
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <h4
                        className={cn(
                          'font-semibold flex items-center gap-2 transition-colors',
                          isSelected ? 'text-primary' : 'text-foreground'
                        )}
                      >
                        {role.name}
                      </h4>
                      {role.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
                          {role.description}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground/50 italic">설명 없음</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredRoles.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  검색 결과가 없습니다.
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-card shrink-0">
          <div className="flex-1 text-sm text-muted-foreground flex items-center">
            {selectedRoleIds.length}개 역할 선택됨
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assignRoles.isPending}
          >
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={assignRoles.isPending || rolesLoading}>
            {assignRoles.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
