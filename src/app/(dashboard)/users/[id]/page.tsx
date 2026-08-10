'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Shield, UserX } from 'lucide-react';

import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Separator } from '@/components/ui';
import { AssignRolesDialog } from '@/components/users/AssignRolesDialog';
import { UserDialog } from '@/components/users/UserDialog';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, ApiError, apiGet, apiPatch, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { getUserTypeBadgeVariant } from '@/lib/user-helpers';

interface Permission {
  permission: {
    id: string;
    resource: string;
    action: string;
    description?: string;
  };
}

interface Role {
  role: {
    id: string;
    name: string;
    description?: string;
    permissions: Permission[];
  };
}

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: Role[];
  clients: Array<{
    client: {
      id: string;
      name: string;
      code: string;
    };
  }>;
}

/**
 * 이 화면 전용 유형 판별. `@/lib/user-helpers` 의 `getUserTypeLabel` 과 **판정 규칙이 다르다**.
 *
 * 공용판은 `user.userType` 을 먼저 보고, 아무것도 맞지 않으면 '미분류' 로 떨어진다.
 * 그런데 `userType` 은 Prisma 스키마에 없는 필드다(`prisma/schema.prisma` 확인). 즉
 * 공용판을 여기에 그대로 쓰면 소속 고객사가 없는 비-ADMIN 사용자가 전부
 * '기술 지원팀'(파란 배지) 에서 '미분류'(회색 배지) 로 바뀐다.
 *
 * 목록 화면(UserTable/UserMobileList)은 공용판을 쓰고 있어 지금도 문구가 갈린다.
 * 어느 쪽 문구가 옳은지는 화면 소유자가 정할 일이므로, 정비 커밋에서 한쪽으로
 * 몰지 않고 차이를 남긴 채 이름만 분리해 둔다.
 */
const getUserTypeLabelLegacy = (user: User): string => {
  // 1. Admin 역할이 있으면 시스템 관리자
  const hasAdminRole = user.roles.some((ur) => ur.role.name === 'ADMIN');
  if (hasAdminRole) {
    return '시스템 운영팀';
  }

  // 2. 고객사에 소속되어 있으면 SR 요청자
  if (user.clients.length > 0) {
    return '고객사 담당자';
  }

  // 3. 고객사에 소속되지 않았으면 SR 처리자 (엔지니어)
  return '기술 지원팀';
};

/**
 * 서버가 준 삭제 실패 메시지를 이 화면의 문구로 옮긴다.
 *
 * 서버 메시지를 그대로 띄우지 않는 이유는 문장이 API 문맥으로 쓰여 있기 때문이다
 * ("본인 계정은 삭제할 수 없습니다" 는 삭제 주체가 누구인지가 화면에서만 분명하다).
 * 다섯 갈래 전부가 계약이다 — 특히 **진행 중인 SR** 갈래는 서버가 SR 번호를 붙여 보내므로
 * 재작성하면 사용자가 어느 SR 때문에 막혔는지 알 수 없게 된다. 그래서 그대로 통과시킨다.
 */
function toDeleteErrorMessage(serverMessage: string): string {
  if (serverMessage.includes('본인 계정은 삭제할 수 없습니다')) {
    return '자신의 계정은 삭제할 수 없습니다.';
  }
  if (serverMessage.includes('진행 중인 SR이 할당되어 있습니다')) {
    // 서버에서 보낸 상세 메시지(SR 번호 포함)를 그대로 사용
    return serverMessage;
  }
  if (serverMessage.includes('시스템 운영팀')) {
    return '시스템 운영팀 사용자는 삭제할 수 없습니다.';
  }
  if (serverMessage.includes('SR 요청 또는 처리 이력')) {
    return 'SR 요청/처리 이력이 있는 사용자는 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요.';
  }
  // 어느 갈래에도 맞지 않으면 서버 문구를 그대로 쓴다. 서버가 메시지를 주지 않았을 때의
  // 기본값('삭제 실패')은 apiDelete 의 fallbackMessage 가 채운다.
  return serverMessage;
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignRolesDialogOpen, setIsAssignRolesDialogOpen] = useState(false);
  const { toast } = useToast();
  const { data: session, update } = useSession();

  // useParams 는 동적 세그먼트를 `string | string[]` 로 준다. 이 라우트의 세그먼트는
  // 하나뿐이라 문자열이지만, URL 을 템플릿 리터럴로 만들던 기존 동작과 어긋나지 않도록
  // 같은 방식으로 문자열화한다(쿼리 키도 문자열을 요구한다).
  const userId = String(params.id ?? '');

  const {
    data: user,
    isPending,
    error,
  } = useQuery({
    queryKey: qk.users.detail(userId),
    // `/api/users/[id]` 는 봉투 없이 단건을 그대로 준다.
    queryFn: () => apiGet<User>(`/api/users/${userId}`),
    enabled: userId.length > 0,
    // 404 를 재시도하면 아래 notFound() 가 그만큼 늦게 뜬다. 4xx 는 다시 물어도 답이 같다.
    retry: retryUnlessClientError,
  });

  // 조회 실패 토스트. v5 의 useQuery 에는 onError 가 없어 effect 로 옮겼다.
  // `error` 는 실패마다 새 객체이므로 실패 1회당 정확히 1번 뜬다.
  useEffect(() => {
    if (!error) return;
    // 404 는 오류가 아니라 "없는 대상" 이다 — 토스트 없이 아래 렌더 단계의 notFound() 가
    // 처리한다. 예전 fetchUser 도 404 만 따로 걸러 토스트를 띄우지 않았다.
    if (error instanceof ApiError && error.status === 404) return;
    toast({
      title: '오류',
      description: '사용자 정보를 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
  }, [error, toast]);

  /**
   * 상세를 다시 읽는다. 예전 `fetchUser()` 재호출이 하던 일.
   *
   * ⚠️ 두 호출의 **순서가 의미를 갖는다.** `qk.users.all`(['users'])은
   * `qk.users.detail(id)`(['users', id])의 접두사라 둘 다 기본값으로 무효화하면 같은 상세를
   * 두 번 겨냥한다. 그리고 invalidateQueries 의 `cancelRefetch` 기본값이 true 라, 뒤 호출이
   * 앞 호출이 띄운 조회를 **취소하고 다시 띄운다** — 네트워크 요청이 한 번이 아니라 두 번 나간다.
   * 그래서 목록 쪽은 stale 표시만 남기고(`refetchType: 'none'`), 지금 화면에 떠 있는 상세만
   * 실제로 다시 읽는다. 목록은 /users 로 돌아갈 때 새로 읽힌다.
   */
  const refreshUser = () => {
    // 이름·상태가 바뀌면 목록 화면의 행도 낡는다.
    queryClient.invalidateQueries({ queryKey: qk.users.all, refetchType: 'none' });
    queryClient.invalidateQueries({ queryKey: qk.users.detail(userId) });
  };

  const activateUser = useMutation({
    mutationFn: () =>
      apiPatch(`/api/users/${userId}`, { isActive: true }, { fallbackMessage: '활성화 실패' }),
    onSuccess: () => {
      toast({
        title: '활성화 완료',
        // 낙관적 갱신을 하지 않으므로 토스트 시점의 `user` 는 아직 활성화 전 값이다.
        // 이름만 쓰므로 문구는 예전과 같다.
        description: `사용자 ${user?.name}이(가) 활성화되었습니다.`,
      });
      refreshUser();
    },
    // 실패 시에는 재조회하지 않는다 — 예전에도 catch 블록은 토스트만 띄웠다.
    onError: () => {
      toast({
        title: '오류 발생',
        description: '사용자 활성화에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const deleteUser = useMutation({
    mutationFn: ({ hard }: { hard: boolean }) =>
      apiDelete(hard ? `/api/users/${userId}?hard=true` : `/api/users/${userId}`, {
        fallbackMessage: '삭제 실패',
      }),
    onSuccess: (_data, { hard }) => {
      toast({
        title: hard ? '완전 삭제 완료' : '비활성화 완료',
        description: hard
          ? '사용자가 영구적으로 삭제되었습니다.'
          : '사용자가 성공적으로 비활성화되었습니다.',
      });

      // ⚠️ `refetchType: 'none'` 이 필수다. `qk.users.all`(['users'])은
      // `qk.users.detail(id)`(['users', id])의 **접두사**라, 기본 무효화는 방금 지운
      // 사용자의 상세까지 곧바로 다시 조회한다. 그 404 가 아래 notFound() 를 때리면
      // /users 로 이동하기 전에 not-found 화면이 번쩍인다. 여기서는 stale 표시만 남기고,
      // 목록 화면이 마운트될 때 새로 읽게 한다.
      queryClient.invalidateQueries({ queryKey: qk.users.all, refetchType: 'none' });

      router.push('/users');
    },
    onError: (error) => {
      // 응답을 받았으면(ApiError) 서버 문구를 재매핑하고, 네트워크 오류처럼 응답 자체가
      // 없으면 예전 catch 블록과 같은 고정 문구를 쓴다. 두 경우의 제목은 원래 같았다.
      toast({
        title: '삭제 실패',
        description:
          error instanceof ApiError
            ? toDeleteErrorMessage(error.message)
            : '사용자 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    },
  });

  const handleUserUpdated = () => {
    refreshUser();
    setIsEditDialogOpen(false);
  };

  const handleRolesUpdated = () => {
    refreshUser();
    setIsAssignRolesDialogOpen(false);
  };

  /**
   * 대상 사용자가 없다.
   *
   * notFound() 를 async 콜백이나 effect 안에서 부르면 React 가 그 예외를 렌더 에러로
   * 잡지 못해 **아무 일도 일어나지 않는다**. v5 에서 사라진 onError 콜백도 마찬가지다.
   * 그래서 404 는 쿼리의 `error` 로 받아 두고 **렌더 중에** 호출한다.
   *
   * 예전 계약은 토스트를 띄우고 router.push('/users') 로 튕기는 것이었다. 그러면 (1) URL 이
   * 목록으로 바뀌어 링크를 공유·북마크한 사람은 왜 튕겼는지 알 수 없고, (2) 뒤로가기를
   * 누르면 다시 튕기는 루프가 되며, (3) 응답 자체는 200 이라 없는 페이지가 크롤러·모니터링에
   * 정상으로 잡힌다. e2e/34-user-detail.spec.ts 가 이 계약(URL 유지 + not-found 화면)을 지킨다.
   */
  if (error instanceof ApiError && error.status === 404) {
    notFound();
  }

  // 첫 로딩만 스피너다. 변이 뒤 무효화로 도는 재조회(isFetching)에서는 화면이 깜빡이면
  // 안 된다 — 예전 fetchUser 도 재호출 때 loading 을 다시 켜지 않았다.
  if (isPending) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">사용자를 찾을 수 없습니다.</p>
      </div>
    );
  }

  // 모든 권한을 중복 제거하여 수집
  const allPermissions = new Map<string, Permission['permission']>();
  user.roles.forEach((userRole) => {
    userRole.role.permissions.forEach((rolePermission) => {
      const key = `${rolePermission.permission.resource}.${rolePermission.permission.action}`;
      if (!allPermissions.has(key)) {
        allPermissions.set(key, rolePermission.permission);
      }
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/users">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-bold tracking-tight truncate">{user.name}</h1>
            <p className="text-xs md:text-sm text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
        <div className="flex gap-1 md:gap-2">
          <PermissionGuard roles={['ADMIN']}>
            <Button
              variant="outline"
              onClick={() => setIsAssignRolesDialogOpen(true)}
              className="h-9 w-9 p-0 md:h-10 md:w-auto md:px-4"
              title="역할 관리"
            >
              <Shield className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">역할 관리</span>
            </Button>
          </PermissionGuard>
          <PermissionGuard roles={['ADMIN']}>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(true)}
              className="h-9 w-9 p-0 md:h-10 md:w-auto md:px-4"
              title="수정"
            >
              <Pencil className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">수정</span>
            </Button>
          </PermissionGuard>
          {/* 비활성 사용자 활성화 버튼 */}
          {!user.isActive && (
            <PermissionGuard roles={['ADMIN']}>
              <Button
                variant="outline"
                className="h-9 w-9 p-0 md:h-10 md:w-auto md:px-4 text-green-600 border-green-600 hover:bg-green-50"
                title="활성화"
                onClick={() => activateUser.mutate()}
              >
                <svg
                  className="h-4 w-4 md:mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="hidden md:inline">활성화</span>
              </Button>
            </PermissionGuard>
          )}
          <PermissionGuard roles={['ADMIN']}>
            <Button
              variant="outline"
              onClick={async () => {
                // 세션 업데이트 시도
                await update();
                const currentRoles = session?.user?.roles || [];
                const isAdmin = currentRoles.includes('ADMIN');

                if (!isAdmin) {
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
                const hasSystemRole = user.roles.some((ur) =>
                  ['ADMIN', 'MANAGER'].includes(ur.role.name)
                );

                if (hasSystemRole) {
                  toast({
                    title: '삭제 제한',
                    description:
                      '시스템 관리자 계정은 삭제할 수 없습니다. 역할을 변경하거나 비활성화하세요.',
                    variant: 'destructive',
                  });
                  return;
                }

                const isHardDelete = !user.isActive;
                const confirmMessage = isHardDelete
                  ? `정말 사용자 ${user.name} (이메일: ${user.email}) 을 완전히 삭제하시겠습니까?\n\n주의: 이 작업은 영구적이며 모든 데이터가 삭제됩니다. SR 이력이 있는 사용자는 삭제할 수 없습니다.`
                  : `정말 사용자 ${user.name} (이메일: ${user.email}) 을 비활성화하시겠습니까?\n\n경고: 이 작업은 되돌릴 수 없습니다.`;

                if (window.confirm(confirmMessage)) {
                  // 성공·실패 토스트와 이동은 deleteUser 의 onSuccess/onError 가 맡는다.
                  // 서버 문구 재매핑도 그쪽(toDeleteErrorMessage)에 있다.
                  deleteUser.mutate({ hard: isHardDelete });
                }
              }}
              className="h-9 w-9 p-0 md:h-10 md:w-auto md:px-4 text-destructive border-destructive hover:bg-destructive hover:text-white"
              title={user.isActive ? '비활성화' : '완전 삭제'}
            >
              <UserX className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{user.isActive ? '비활성화' : '완전 삭제'}</span>
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">이름</h3>
                <p className="text-sm">{user.name}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">이메일</h3>
                <p className="text-sm">{user.email}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">사용자 유형</h3>
                <Badge variant={getUserTypeBadgeVariant(getUserTypeLabelLegacy(user))}>
                  {getUserTypeLabelLegacy(user)}
                </Badge>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">상태</h3>
                <Badge variant={user.isActive ? 'default' : 'secondary'}>
                  {user.isActive ? '활성' : '비활성'}
                </Badge>
              </div>
            </div>

            {user.clients.length > 0 && (
              <>
                <Separator />

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">할당된 고객사</h3>
                  <div className="flex gap-2 flex-wrap">
                    {user.clients.map((uc) => (
                      <Link key={uc.client.id} href={`/clients/${uc.client.id}`}>
                        <Badge variant="outline" className="cursor-pointer hover:bg-secondary/50">
                          {uc.client.name} ({uc.client.code})
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">가입일</h3>
                <p className="text-sm">{new Date(user.createdAt).toLocaleString('ko-KR')}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">수정일</h3>
                <p className="text-sm">{new Date(user.updatedAt).toLocaleString('ko-KR')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>통계</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">역할</span>
              </div>
              <span className="text-2xl font-bold">{user.roles.length}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">권한</span>
              </div>
              <span className="text-2xl font-bold">{allPermissions.size}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>역할 및 권한</CardTitle>
          <CardDescription>이 사용자에게 할당된 역할과 권한입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">역할</h3>
            <div className="flex gap-2 flex-wrap">
              {user.roles.length === 0 ? (
                <Badge variant="outline">역할 없음</Badge>
              ) : (
                user.roles.map((userRole) => (
                  <Badge key={userRole.role.id} variant="secondary">
                    {userRole.role.name}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              권한 목록 ({allPermissions.size}개)
            </h3>
            {allPermissions.size === 0 ? (
              <p className="text-sm text-muted-foreground">할당된 권한이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from(
                  Array.from(allPermissions.values()).reduce((acc, curr) => {
                    if (!acc.has(curr.resource)) {
                      acc.set(curr.resource, []);
                    }
                    acc.get(curr.resource)?.push(curr);
                    return acc;
                  }, new Map<string, Permission['permission'][]>())
                ).map(([resource, permissions]) => (
                  <Card key={resource} className="shadow-sm">
                    <CardHeader className="pb-2 bg-card/50 border-b px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        <CardTitle className="text-sm font-bold capitalize text-foreground">
                          {resource}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-3 pb-3 px-4">
                      <div className="flex flex-wrap gap-2">
                        {permissions.map((p) => (
                          <Badge
                            key={p.id}
                            variant="outline"
                            className="bg-card hover:bg-muted font-normal text-muted-foreground border-border"
                          >
                            {p.action}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <UserDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        user={user}
        onSaved={handleUserUpdated}
      />

      <AssignRolesDialog
        open={isAssignRolesDialogOpen}
        onOpenChange={setIsAssignRolesDialogOpen}
        user={user}
        onSaved={handleRolesUpdated}
      />
    </div>
  );
}
