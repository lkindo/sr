'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Mail, Trash2, Users } from 'lucide-react';

import { Badge } from '@/components/ui';
import { Button } from '@/components/ui';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';
import { useToast } from '@/hooks/use-toast';
import { apiGet, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

interface User {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  roles: Array<{
    role: {
      id: string;
      name: string;
    };
  }>;
}

/** `/api/clients/[id]` 의 응답 중 이 시트가 쓰는 부분만. */
interface ClientDetail {
  users?: Array<{ user: User }>;
}

interface ClientUsersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string;
}

/**
 * 조회 실패 시 토스트에 쓰는 문구.
 *
 * 서버가 준 메시지를 쓰지 않는 것은 의도다 — 이 시트는 실패 원인을 구분하지 않고 항상 같은
 * 문장을 보여 준다. React Query 로 옮기면서도 그 계약을 그대로 둔다.
 */
const LOAD_ERROR_MESSAGE = '사용자 목록을 불러오는데 실패했습니다.';

/**
 * UserClient 구조에서 user 정보 추출.
 *
 * 모듈 스코프에 둬서 신원을 고정한다 — `select` 는 함수 참조가 바뀌면 다시 계산되고,
 * 그때마다 새 배열이 나와 표 전체가 불필요하게 리렌더된다.
 * (예전에는 같은 이유로 fetchUsers 를 useCallback 으로 감쌌다.)
 */
function selectUsers(client: ClientDetail): User[] {
  return client.users?.map((uc) => uc.user) || [];
}

export function ClientUsersSheet({
  open,
  onOpenChange,
  clientId,
  clientName,
}: ClientUsersSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const { toast } = useToast();

  const {
    data: users = [],
    isFetching,
    error,
    refetch,
  } = useQuery({
    // ⚠️ `/api/clients/[id]` 는 목록 봉투를 쓰지 않고 bare object 를 준다(예외 라우트).
    // 그래서 apiList 가 아니라 apiGet 이다.
    queryKey: qk.clients.detail(clientId ?? ''),
    queryFn: () => apiGet<ClientDetail>(`/api/clients/${clientId}`),
    // 예전 effect 의 `open && clientId` 가드를 그대로 옮긴 것이다. clientId 가 null 일 때
    // 위 키의 '' 는 쓰이지 않는다 — 쿼리가 아예 돌지 않으므로.
    enabled: open && !!clientId,
    // 시트를 닫았다 열 때마다 다시 조회하던 동작을 유지한다. 전역 기본값 60초를 그대로 두면
    // 그 사이 바뀐 소속 사용자가 반영되지 않은 목록을 보게 된다.
    staleTime: 0,
    retry: retryUnlessClientError,
    select: selectUsers,
  });

  // 예전 `loading` state 는 첫 조회뿐 아니라 삭제 후 재조회에서도 켜져 표가 "로딩 중..." 으로
  // 바뀌었다. 그래서 isPending 이 아니라 isFetching 이다 — 이 쿼리에는 창 포커스 재조회가
  // 없으므로(전역 refetchOnWindowFocus: false) 깜빡임을 만들 다른 재조회 경로도 없다.
  const loading = isFetching;

  // 조회 실패는 토스트로만 알린다(표는 비어 보인다). v5 의 useQuery 에는 onError 가 없어
  // effect 로 옮긴다. `error` 는 실패마다 새 객체이므로 실패 1회당 정확히 한 번 뜬다 —
  // 기존 catch 와 같은 횟수다.
  useEffect(() => {
    if (!error) return;
    toast({
      title: '오류',
      description: LOAD_ERROR_MESSAGE,
      variant: 'destructive',
    });
  }, [error, toast]);

  const handleUserDeleted = () => {
    // 예전에는 fetchUsers() 를 다시 불렀다. refetch 가 같은 일을 한다.
    void refetch();
    // Dialog closes itself via onOpenChange(false) inside DeleteUserDialog upon success
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {clientName} - 소속 사용자
            </SheetTitle>
            <SheetDescription>이 고객사에 소속된 사용자 목록입니다.</SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">로딩 중...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">등록된 사용자가 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    총 <span className="font-semibold text-foreground">{users.length}</span>명
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/clients/${clientId}`}>고객사 상세보기</Link>
                  </Button>
                </div>

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
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/users/${user.id}`}
                              className="text-primary hover:underline"
                            >
                              {user.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{user.email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {(user.roles || []).length === 0 ? (
                                <Badge variant="outline" className="text-xs">
                                  역할 없음
                                </Badge>
                              ) : (
                                (user.roles || []).map((ur) => (
                                  <Badge key={ur.role.id} variant="secondary" className="text-xs">
                                    {ur.role.name}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={user.isActive ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {user.isActive ? '활성' : '비활성'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/users/${user.id}`}>상세보기</Link>
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="ml-2"
                              onClick={() => {
                                setSelectedUser(user);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 p-3 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    사용자 관리는 사용자 페이지에서 할 수 있습니다.
                  </p>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete User Dialog */}
      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        user={selectedUser}
        onDeleted={handleUserDeleted}
      />
    </>
  );
}
