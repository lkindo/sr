'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

import { DeleteRoleDialog } from '@/components/roles/DeleteRoleDialog';
import { PermissionBoard } from '@/components/roles/PermissionBoard';
import { RoleDialog } from '@/components/roles/RoleDialog';
import { RoleMobileList } from '@/components/roles/RoleMobileList';
import { RoleTable } from '@/components/roles/RoleTable';
import { Button } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { ApiError, apiGet, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { RoleItem as Role } from '@/types/role';

interface RolesClientProps {
  /**
   * 서버가 미리 조회한 역할 목록.
   *
   * React Query 의 `initialData` 로 넣어 **첫 렌더에 이미 데이터가 있게** 한다.
   * 이후 무효화·재조회는 예전 그대로 클라이언트가 맡으므로, 다이얼로그에서 역할을
   * 만들거나 지운 뒤의 갱신 동작은 바뀌지 않는다.
   *
   * `null` 이면 서버 조회가 인가에 막혔다는 뜻이다(아래 `accessDenied` 참조).
   */
  initialRoles: Role[] | null;
}

export default function RolesClient({ initialRoles }: RolesClientProps) {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: roles = [],
    isPending,
    error,
  } = useQuery({
    queryKey: qk.roles.all,
    queryFn: async () => {
      // `/api/roles` 는 봉투 없이 bare 배열을 돌려준다(route.ts 가 `NextResponse.json(roles)`).
      // 그래서 `apiList` 가 아니라 `apiGet` 이다 — meta 를 합성해 봐야 쓸 데가 없다.
      const data = await apiGet<Role[]>('/api/roles');
      // 권한 데이터가 없는 경우 빈 배열로 초기화
      return data.map((role) => ({
        ...role,
        permissions: role.permissions || [],
      }));
    },
    // 403 은 다시 물어봐도 403 이다. 전역 기본값 `retry: 1` 이면 권한 없음 화면이
    // 한 박자 늦게 뜬다.
    retry: retryUnlessClientError,
    // 목록은 항상 신선해야 한다. 전역 staleTime 60초를 그대로 두면 방금 만든 역할이
    // 목록에 안 잡히는 것처럼 보인다.
    staleTime: 0,
    // 서버가 이미 조회한 값으로 첫 렌더를 채운다. 스피너 없이 목록이 바로 보인다.
    // 인가에 막혀 null 이 온 경우에는 주지 않는다 — 그때는 클라이언트 조회가 403 을
    // 다시 받아 아래 `accessDenied` 화면이 뜨는 편이 정확하다.
    ...(initialRoles ? { initialData: initialRoles } : {}),
  });

  /**
   * 접근이 거부됐는가. 빈 목록과 구분해서 보여 주기 위한 판정이다.
   *
   * 403 은 이제 성공 경로의 조기 return 이 아니라 `error` 로 온다. 다만 계약은 그대로다:
   * 403 을 토스트로만 알리고 목록을 비우면 화면은 '등록된 역할이 없습니다.' 가 되는데,
   * 그건 "권한 없음" 과 "데이터 없음" 을 구분할 수 없게 만드는 거짓말이다.
   */
  // 서버 조회가 막혔으면(initialRoles === null) 클라이언트 조회 결과를 기다리지 않고
  // 곧바로 접근 거부로 판정한다. 기다리면 권한 없는 사용자에게 빈 목록이 한 번 깜빡인다.
  const accessDenied = initialRoles === null || (error instanceof ApiError && error.status === 403);

  // 403 이 아닌 실패만 토스트로 알린다(403 은 아래 전용 화면이 대신 말해 준다).
  // 실패해도 목록은 빈 배열로 남고 평소 화면을 그린다 — 기존 동작 그대로다.
  useEffect(() => {
    if (!error || accessDenied) return;
    toast({
      title: '오류',
      description: '역할 목록을 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
  }, [error, accessDenied, toast]);

  /**
   * 저장·삭제 후 목록 갱신.
   *
   * 예전에는 `setLoading(true)` 로 화면 전체를 '로딩 중...' 으로 덮었지만, 무효화는
   * 캐시를 남겨 둔 채 배경에서 다시 가져오므로 표가 그대로 보인 상태로 갱신된다.
   * 아래 스피너 분기가 `isPending`(첫 로딩)인 이유이기도 하다 — `isFetching` 을 물리면
   * 저장할 때마다 표가 사라졌다 나타난다.
   */
  const refreshRoles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.roles.all });
  }, [queryClient]);

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
    refreshRoles();
    setIsRoleDialogOpen(false);
  };

  const handlePermissionsSaved = () => {
    refreshRoles();
    setIsPermissionDialogOpen(false);
  };

  const handleRoleDeleted = () => {
    refreshRoles();
    setIsDeleteDialogOpen(false);
  };

  // 권한이 없으면 "역할이 없다" 로 위장하지 않고 그렇다고 말한다.
  //
  // **이 검사는 로딩보다 먼저 와야 한다.** 서버가 인가에 막혀 `initialRoles === null` 을
  // 내려보낸 경우, 로딩 분기가 앞에 있으면 클라이언트 조회가 403 을 받아 올 때까지
  // 권한 없는 사용자에게 "로딩 중..." 이 먼저 보인다 — 이 컴포넌트 주석이
  // "기다리지 않고 곧바로 접근 거부" 라고 보장한 동작과 어긋난다.
  // 메뉴는 ROLE:READ 로 게이트되지만(config/navigation.ts) URL 직접 접근은 남는다.
  if (accessDenied) {
    return (
      <div className="space-y-6">
        <div className="sr-card-template">
          <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">역할 목록</h3>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="text-muted-foreground">역할 목록을 볼 권한이 없습니다.</p>
            <p className="text-sm text-muted-foreground">
              필요하면 시스템 관리자에게 권한을 요청하세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template">
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
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end bg-card/50">
          <div className="text-xs text-muted-foreground font-medium">
            전체{' '}
            <span className="text-[hsl(var(--sr-primary-dark))] font-bold">{roles.length}</span>개
          </div>
        </div>

        {/* Desktop Table View */}
        <RoleTable
          roles={roles}
          onEdit={handleEditRole}
          onManagePermissions={handleManagePermissions}
          onDelete={handleDeleteRole}
        />

        {/* Mobile Card View */}
        <RoleMobileList
          roles={roles}
          onEdit={handleEditRole}
          onManagePermissions={handleManagePermissions}
          onDelete={handleDeleteRole}
        />
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
