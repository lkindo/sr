'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Pencil, Shield, UserX } from 'lucide-react';

import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { Separator } from '@/components/ui';
import { AssignRolesDialog } from '@/components/users/AssignRolesDialog';
import { UserDialog } from '@/components/users/UserDialog';
import { useToast } from '@/hooks/use-toast';
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

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  /**
   * 대상 사용자가 없다.
   *
   * notFound() 를 async 콜백(fetchUser) 안에서 부르면 React 가 그 예외를 렌더 에러로
   * 잡지 못해 아무 일도 일어나지 않는다. 상태로 옮겨 **렌더 중에** 호출한다.
   */
  const [userMissing, setUserMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignRolesDialogOpen, setIsAssignRolesDialogOpen] = useState(false);
  const { toast } = useToast();
  const { data: session, update } = useSession();

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch(`/api/users/${params.id}`);
      if (!response.ok) {
        if (response.status === 404) {
          // 예전에는 토스트를 띄우고 router.push('/users') 로 튕겼다. 그러면 (1) URL 이
          // 목록으로 바뀌어 링크를 공유·북마크한 사람은 왜 튕겼는지 알 수 없고,
          // (2) 뒤로가기를 누르면 다시 튕기는 루프가 되며, (3) 응답 자체는 200 이라
          // 없는 페이지가 크롤러·모니터링에 정상으로 잡힌다.
          // 이제 not-found 경계를 띄운다(호출은 아래 렌더 단계에서 한다).
          setUserMissing(true);
          return;
        }
        throw new Error('Failed to fetch user');
      }
      const data = await response.json();
      setUser(data);
    } catch {
      toast({
        title: '오류',
        description: '사용자 정보를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [params.id, router, toast]);

  useEffect(() => {
    if (params.id) {
      fetchUser();
    }
  }, [params.id, fetchUser]);

  const handleUserUpdated = () => {
    fetchUser();
    setIsEditDialogOpen(false);
  };

  const handleRolesUpdated = () => {
    fetchUser();
    setIsAssignRolesDialogOpen(false);
  };

  // 렌더 중 호출이어야 Next 가 not-found 경계를 띄운다.
  if (userMissing) {
    notFound();
  }

  if (loading) {
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
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/users/${user.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ isActive: true }),
                    });

                    if (!response.ok) throw new Error('Failed to activate user');

                    toast({
                      title: '활성화 완료',
                      description: `사용자 ${user.name}이(가) 활성화되었습니다.`,
                    });
                    fetchUser();
                  } catch {
                    toast({
                      title: '오류 발생',
                      description: '사용자 활성화에 실패했습니다.',
                      variant: 'destructive',
                    });
                  }
                }}
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
                  try {
                    const url = isHardDelete
                      ? `/api/users/${user.id}?hard=true`
                      : `/api/users/${user.id}`;
                    const res = await fetch(url, {
                      method: 'DELETE',
                    });

                    if (!res.ok) {
                      const errorData = await res.json().catch(() => ({}));
                      let errorMessage = errorData.error || errorData.message || '삭제 실패';

                      if (errorMessage.includes('본인 계정은 삭제할 수 없습니다')) {
                        errorMessage = '자신의 계정은 삭제할 수 없습니다.';
                      } else if (errorMessage.includes('진행 중인 SR이 할당되어 있습니다')) {
                        // 서버에서 보낸 상세 메시지(SR 번호 포함)를 그대로 사용
                        // errorMessage = errorMessage;
                      } else if (errorMessage.includes('시스템 운영팀')) {
                        errorMessage = '시스템 운영팀 사용자는 삭제할 수 없습니다.';
                      } else if (errorMessage.includes('SR 요청 또는 처리 이력')) {
                        errorMessage =
                          'SR 요청/처리 이력이 있는 사용자는 완전히 삭제할 수 없습니다. 비활성화 상태를 유지해주세요.';
                      }

                      toast({
                        title: '삭제 실패',
                        description: errorMessage,
                        variant: 'destructive',
                      });
                      return;
                    }

                    toast({
                      title: isHardDelete ? '완전 삭제 완료' : '비활성화 완료',
                      description: isHardDelete
                        ? '사용자가 영구적으로 삭제되었습니다.'
                        : '사용자가 성공적으로 비활성화되었습니다.',
                    });

                    router.push('/users');
                  } catch {
                    toast({
                      title: '삭제 실패',
                      description: '사용자 삭제에 실패했습니다.',
                      variant: 'destructive',
                    });
                  }
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
