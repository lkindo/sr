'use client';

import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { EmailUnverifiedBadge } from '@/components/users/EmailUnverifiedBadge';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { apiDelete, apiList, apiPatch, apiPost, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { showsEmailUnverified } from '@/lib/user-helpers';

/** GET /api/users 응답 중 이 화면이 쓰는 부분. */
interface CompanyUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  /** 가입 확인 링크를 연 시각(결정 D13 B+). */
  emailVerified?: string | null;
  roles: Array<{ role: { name: string } }>;
  clients: Array<{ clientId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }>;
}

/** 한 번에 불러오는 수. 넘으면 화면에 그 사실을 적는다(조용히 자르지 않는다). */
const PAGE_SIZE = 100;
const LIST_PARAMS = { page: 1, pageSize: PAGE_SIZE, scope: 'company' } as const;

const ROLE_LABELS: Record<string, string> = {
  CLIENT_ADMIN: '고객사 관리자',
  CLIENT_USER: '고객사 사용자',
};

/**
 * 자사 사용자 — 고객사 관리자(CLIENT_ADMIN) 전용 화면 (헌법 §1.1, 소유자 결정 2026-09-18 D6).
 *
 * 헌법은 CLIENT_ADMIN 이 "자신이 소속된 고객사의 모든 사용자를 관리" 한다고 적었고, 서버도 자사 사용자
 * 조회·수정과 소속 가입 승인·거절을 이미 허용했지만 메뉴가 내부 역할 전용이라 화면으로는 할 수 없었다.
 * 할 수 있는 것은 PRD 권한표대로 **조회·가입 승인/거절·비활성화(재활성화)** 다. 사용자 생성과 역할
 * 부여는 이 화면에 없다(운영팀 업무).
 *
 * 범위는 서버가 정한다 — GET /api/users 는 외부 사용자에게 자기 고객사 사용자만 준다. 이 화면은
 * 받은 목록을 보여 줄 뿐 스스로 거르지 않는다.
 */
export default function CompanyUsersPage() {
  const { hasAnyRole } = usePermissions();
  const { data: session } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isClientAdmin = hasAnyRole(['CLIENT_ADMIN']);

  const { data, isPending, error } = useQuery({
    queryKey: qk.users.list(LIST_PARAMS),
    queryFn: () => apiList<CompanyUser>(`/api/users?page=1&pageSize=${PAGE_SIZE}`),
    enabled: isClientAdmin,
    retry: retryUnlessClientError,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.users.all });
  const failed = (fallback: string) => (err: unknown) =>
    toast({
      title: '오류',
      description: err instanceof Error ? err.message : fallback,
      variant: 'destructive',
    });

  const approve = useMutation({
    mutationFn: (userId: string) => apiPost(`/api/users/${userId}/client/approve`),
    onSuccess: () => {
      toast({ title: '성공', description: '가입을 승인했습니다.' });
      void refresh();
    },
    onError: failed('가입을 승인하지 못했습니다.'),
  });

  const reject = useMutation({
    mutationFn: (userId: string) => apiDelete(`/api/users/${userId}/client/approve`),
    onSuccess: () => {
      toast({ title: '성공', description: '가입 신청을 거절했습니다.' });
      void refresh();
    },
    onError: failed('가입 신청을 거절하지 못했습니다.'),
  });

  const setActive = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiPatch(`/api/users/${userId}`, { isActive }),
    onSuccess: (_data, { isActive }) => {
      toast({
        title: '성공',
        description: isActive ? '사용자를 다시 활성화했습니다.' : '사용자를 비활성화했습니다.',
      });
      void refresh();
    },
    onError: failed('사용자 상태를 바꾸지 못했습니다.'),
  });

  const busy = approve.isPending || reject.isPending || setActive.isPending;

  if (!isClientAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">고객사 관리자만 볼 수 있는 화면입니다.</p>
      </div>
    );
  }

  const users = data?.data ?? [];
  const total = data?.meta.totalItems ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-7 w-7" />
          자사 사용자
        </h1>
        <p className="text-muted-foreground">
          우리 회사 사용자의 가입 신청을 승인하거나 거절하고, 퇴사자 등은 비활성화할 수 있습니다.
          사용자 생성과 역할 변경은 운영팀에 요청하세요.
        </p>
      </div>

      {isPending ? (
        <p className="text-muted-foreground">로딩 중...</p>
      ) : error ? (
        <p className="text-destructive">사용자 목록을 불러오지 못했습니다.</p>
      ) : (
        <>
          {total > users.length && (
            <p className="text-sm text-muted-foreground">
              전체 {total}명 중 {users.length}명을 표시합니다.
            </p>
          )}
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      사용자가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const pending = user.clients.some((link) => link.status === 'PENDING');
                    const isSelf = user.id === session?.user?.id;
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{user.email}</span>
                            {showsEmailUnverified(user) && <EmailUnverifiedBadge />}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.roles
                            .map(({ role }) => ROLE_LABELS[role.name] ?? role.name)
                            .join(', ') || '-'}
                        </TableCell>
                        <TableCell>
                          {pending ? (
                            <Badge variant="secondary">가입 승인 대기</Badge>
                          ) : user.isActive ? (
                            <Badge>활성</Badge>
                          ) : (
                            <Badge variant="outline">비활성</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {pending ? (
                            <>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => approve.mutate(user.id)}
                                aria-label={`${user.name} 가입 승인`}
                              >
                                승인
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  if (window.confirm(`${user.name} 님의 가입 신청을 거절할까요?`)) {
                                    reject.mutate(user.id);
                                  }
                                }}
                                aria-label={`${user.name} 가입 거절`}
                              >
                                거절
                              </Button>
                            </>
                          ) : isSelf ? null : user.isActive ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `${user.name} 님을 비활성화할까요? 비활성화되면 로그인할 수 없습니다.`
                                  )
                                ) {
                                  setActive.mutate({ userId: user.id, isActive: false });
                                }
                              }}
                              aria-label={`${user.name} 비활성화`}
                            >
                              비활성화
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setActive.mutate({ userId: user.id, isActive: true })}
                              aria-label={`${user.name} 다시 활성화`}
                            >
                              다시 활성화
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
