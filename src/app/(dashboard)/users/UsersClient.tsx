'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
// Select 관련 import 제거됨
import { type AssignableRole, AssignRolesDialog } from '@/components/users/AssignRolesDialog';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';
import { UserDialog } from '@/components/users/UserDialog';
import { UserMobileList } from '@/components/users/UserMobileList';
import { UserTable } from '@/components/users/UserTable';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import {
  ApiError,
  apiGet,
  apiList,
  apiPatch,
  buildQuery,
  retryUnlessClientError,
} from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { qk } from '@/lib/query-keys';
import type { ClientSummary } from '@/types/client.types';
import type { UserListItem } from '@/types/user-view';

interface PaginationData {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * 한 페이지 크기.
 *
 * 예전에는 `pagination` state 안에 있었지만 서버가 요청한 값을 그대로 meta 로 되돌려주므로
 * (src/lib/pagination.ts) 사실상 처음부터 상수 10이었다. 상수로 못박아 두면 "조회 조건이
 * 응답에서 파생된다" 는 순환(응답 → state → 다음 요청)이 사라진다.
 */
const PAGE_SIZE = 10;

/**
 * 이 화면이 부르는 고객사 목록의 파라미터 — 없다.
 *
 * UserDialog 는 같은 라우트를 `?pageSize=100` 으로 부른다. URL 이 다르면 캐시도 달라야 하므로
 * 파라미터 객체를 키와 쿼리스트링 **양쪽의 출처**로 쓴다(둘이 어긋날 수 없게).
 */
const CLIENT_LIST_PARAMS = {};

/** `?? []` 를 렌더마다 새 배열로 만들지 않기 위한 고정 빈 배열. */
const NO_USERS: UserListItem[] = [];
const NO_CLIENTS: ClientSummary[] = [];
const NO_ROLES: AssignableRole[] = [];

export default function UsersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // useSession 호출은 유지하되 미사용 리턴값 제거
  useSession();
  const { toast } = useToast();
  const { hasPermission, isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  // 서버(src/lib/policies.ts 의 canCreateUser)와 같은 규칙이다: ADMIN 이거나 USER:CREATE.
  const canCreateUser = isAdmin() || hasPermission('USER', 'CREATE');

  /**
   * **URL 이 조회 조건의 단일 진실이다.**
   *
   * 예전에는 목록을 두 경로가 각각 가져왔다: (1) 입력 onChange → searchQuery 상태 →
   * fetchUsers 의 의존성, (2) 제출/필터 → updateUrl → router.push → searchParams 효과.
   * 두 응답이 경합해 늦게 도착한 쪽이 상태를 덮었고, E2E 에서 '검색했는데 대상 행이
   * 나타나지 않음' 이 4회 중 1회 재현됐다. 취소(AbortController)를 덧대는 것보다
   * 중복 경로를 없애는 편이 낫다 — SRsDataTable 이 이미 그 방식이다(검색·필터·정렬·
   * 페이지 전부 URL). 부수 효과로 검색 결과가 공유·북마크 가능해진다.
   *
   * 아래 applied* 는 URL 에서 파생한 "지금 적용된" 조건이고, searchQuery 는 입력창의
   * 로컬 값일 뿐이다(디바운스 후 URL 로 반영된다).
   *
   * ⚠️ React Query 로 옮긴 뒤에는 이 계약이 **queryKey** 에 그대로 걸린다. 키에 들어가도
   *    되는 것은 applied* 뿐이다 — searchQuery 를 키에 넣는 순간 위에서 없앤 두 번째 경로가
   *    되살아난다(글자마다 요청이 나가고, 늦게 온 응답이 URL 이 정한 결과를 덮는다).
   */
  const appliedPage = Number(searchParams.get('page')) || 1;
  const appliedQ = searchParams.get('q') || '';
  const appliedIsActive = searchParams.get('isActive') || 'true';

  const initialQ = appliedQ;
  const initialIsActive = appliedIsActive;

  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [statusFilter, setStatusFilter] = useState<string>(initialIsActive);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // URL 파라미터가 변경될 때 입력 상태 동기화
  useEffect(() => {
    const q = searchParams.get('q') || '';
    const isActive = searchParams.get('isActive') || 'true';

    setSearchQuery(q);
    setStatusFilter(isActive);
  }, [searchParams]);

  // URL 업데이트 함수
  const updateUrl = useCallback(
    (page: number, search: string, status: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page > 1) params.set('page', page.toString());
      else params.delete('page');

      if (search) params.set('q', search);
      else params.delete('q');

      if (status !== 'true') params.set('isActive', status);
      else params.delete('isActive');

      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Dialog states
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isAssignRoleDialogOpen, setIsAssignRoleDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserListItem | null>(null);

  const {
    data: usersPage,
    isPending: usersPending,
    error: usersError,
  } = useQuery({
    // ⚠️ URL 파생값만. 위 applied* 주석의 ⚠️ 참조 — 여기에 searchQuery 를 넣으면 회귀다.
    queryKey: qk.users.list({ page: appliedPage, q: appliedQ, isActive: appliedIsActive }),
    queryFn: () => {
      // buildQuery 는 빈 값의 키를 아예 빼므로 검색어가 없으면 `search` 가 붙지 않는다.
      // 서버는 `searchParams.get('search') || undefined` 라 예전의 `search=` 와 결과가 같다.
      const url = `/api/users${buildQuery({
        page: appliedPage,
        pageSize: PAGE_SIZE,
        // 입력 상태(searchQuery)가 아니라 URL 파생값을 쓴다 — 이게 경로를 하나로 만드는 핵심이다.
        search: appliedQ,
        isActive: appliedIsActive,
      })}`;
      logger.debug('사용자 목록 조회', { url });
      return apiList<UserListItem>(url);
    },
    // 페이지·검색어가 바뀌는 동안 이전 결과를 그대로 둔다. 아래 `loading` 이 isPending 인 것과
    // 한 쌍이다 — 조건이 바뀔 때마다 표가 접혔다 펴지지 않는다.
    placeholderData: keepPreviousData,
    // 목록은 항상 신선해야 한다. 전역 staleTime 60초를 그대로 두면 방금 만든/바꾼 사용자가
    // 목록에 안 잡힌 것처럼 보인다.
    staleTime: 0,
    // 403·404 는 다시 물어봐도 같다. 전역 기본값 retry:1 이면 권한 없음 화면이 한 박자 늦는다.
    retry: retryUnlessClientError,
  });

  const users = usersPage?.data ?? NO_USERS;

  /**
   * 페이지네이션 표시값.
   *
   * currentPage 는 응답이 아니라 **URL** 에서 온다. 위 계약 그대로이고, keepPreviousData 로
   * 이전 페이지의 meta 가 잠깐 남아 있는 동안에도 페이저가 옛 페이지 번호를 보여 주지 않는다.
   */
  const pagination: PaginationData = {
    currentPage: appliedPage,
    pageSize: PAGE_SIZE,
    totalItems: usersPage?.meta.totalItems ?? 0,
    totalPages: usersPage?.meta.totalPages ?? 1,
  };

  /**
   * 접근이 거부됐는가.
   *
   * 예전에는 실패를 logger.error 로만 남기고 users 를 빈 배열로 두었다. 그러면 화면이
   * '등록된 사용자가 없습니다.' 를 보여 주는데, 이건 **거짓말**이다 — 사용자는 "권한이
   * 없다" 와 "데이터가 없다" 를 구분할 수 없다. ENGINEER 가 정확히 그 상태였다
   * (메뉴는 보이는데 GET /api/users 는 403).
   *
   * 403 은 이제 성공 경로의 조기 return 이 아니라 `error` 로 온다. state 를 두지 않는 이유는
   * 그래야 "성공하면 자동으로 풀린다" 가 공짜로 따라오기 때문이다(예전의 setAccessDenied(false)).
   */
  const accessDenied = usersError instanceof ApiError && usersError.status === 403;

  /**
   * 목록 조회 실패는 **로그만 남긴다** — 토스트를 띄우지 않는다.
   *
   * 예전 fetchUsers 의 catch 가 그랬고, 그건 계약이다(403 은 아래 전용 화면이 대신 말해 준다).
   * v5 의 useQuery 에는 onError 가 없어 effect 로 옮긴다. `error` 는 실패마다 새 객체라
   * 실패 1회당 정확히 한 번 남는다.
   */
  useEffect(() => {
    if (!usersError) return;
    if (usersError instanceof ApiError) {
      // 예전에는 응답 본문 원문을 errorData 로 남겼다. ApiError 는 이미 그 본문에서 뽑은
      // 메시지를 들고 있으므로 같은 자리에 그것을 넣는다.
      logger.error('사용자 목록 조회 실패', undefined, {
        status: usersError.status,
        errorData: usersError.message,
      });
      return;
    }
    logger.error(
      '사용자 목록을 불러오는데 실패했습니다.',
      usersError instanceof Error ? usersError : undefined
    );
  }, [usersError]);

  /**
   * 메타데이터(고객사, 역할).
   *
   * 예전에는 `Promise.all([fetch('/api/clients'), fetch('/api/roles')])` 하나였다. 둘로 쪼갠
   * 이유는 **한쪽 실패가 다른 쪽을 죽이지 않게** 하기 위해서다 — Promise.all 은 먼저 거절된
   * 쪽만 남기고 catch 로 빠지므로, 고객사 조회가 네트워크 오류로 던지면 멀쩡히 도착한 역할
   * 목록까지 버려졌다(역할 뱃지가 통째로 사라진다).
   *
   * 실패해도 토스트를 띄우지 않고 로그만 남기는 것은 그대로다. 예전 `if (res.ok)` 가드도
   * 같은 뜻이었다 — 실패하면 그 목록만 비어 있고 화면은 평소대로 그린다.
   */
  const { data: clients = NO_CLIENTS, error: clientsError } = useQuery({
    queryKey: qk.clients.list(CLIENT_LIST_PARAMS),
    queryFn: async () =>
      (await apiList<ClientSummary>(`/api/clients${buildQuery(CLIENT_LIST_PARAMS)}`)).data,
    // 예전 `Array.isArray(result) ? result : result.data || []` 삼항식은 apiList 가 흡수했다.
    staleTime: 0,
    retry: retryUnlessClientError,
  });

  const { data: roles = NO_ROLES, error: rolesError } = useQuery({
    queryKey: qk.roles.all,
    // `/api/roles` 는 봉투 없이 bare 배열을 돌려준다. 그래서 apiList 가 아니라 apiGet 이다
    // (AssignRolesDialog 와 같은 키·같은 조회라 캐시를 공유한다).
    queryFn: () => apiGet<AssignableRole[]>('/api/roles'),
    staleTime: 0,
    retry: retryUnlessClientError,
  });

  useEffect(() => {
    const error = clientsError ?? rolesError;
    if (!error) return;
    logger.error('메타데이터 조회 실패', error instanceof Error ? error : undefined);
  }, [clientsError, rolesError]);

  // 입력 → URL (디바운스). 조회는 URL 변화가 유발하므로 여기서 fetch 하지 않는다.
  // 값이 이미 URL 과 같으면 아무것도 하지 않는다 — 뒤로가기로 URL 이 바뀌어 입력이
  // 동기화된 직후 그 값을 다시 push 해 히스토리를 오염시키는 것을 막는다.
  useEffect(() => {
    if (searchQuery === appliedQ) return;
    const timer = setTimeout(() => {
      updateUrl(1, searchQuery, statusFilter);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, appliedQ, statusFilter, updateUrl]);

  /**
   * 저장·삭제·소속 변경 후 목록 갱신.
   *
   * 예전 `fetchUsers()` 자리다. `qk.users.all` 은 `qk.users.list(...)` 의 접두사라 어떤
   * 페이지·검색어로 캐시돼 있든 전부 무효화된다.
   */
  const refreshUsers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.users.all });
  }, [queryClient]);

  // 제출은 디바운스를 기다리지 않고 즉시 URL 에 반영한다. 조회는 여전히 URL 이 유발한다.
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrl(1, searchQuery, statusFilter);
  };

  const handlePageChange = (newPage: number) => {
    updateUrl(newPage, searchQuery, statusFilter);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    updateUrl(1, searchQuery, value);
  };

  const handleCreateUser = () => {
    setSelectedUser(null);
    setIsUserDialogOpen(true);
  };

  const handleAssignRoles = (user: UserListItem) => {
    setSelectedUser(user);
    setIsAssignRoleDialogOpen(true);
  };

  const handleDeleteUser = (user: UserListItem) => {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  /**
   * 활성/비활성 토글.
   *
   * ⚠️ variables 의 `currentStatus` 는 이름 그대로 **현재 상태**다. 보내는 값은
   * `!currentStatus` 이므로 호출부가 "원하는 상태" 를 넘기면 뒤집혀 무동작이 된다
   * (아래 일괄 버튼 주석 참조).
   *
   * 예전에는 성공할 때마다 `fetchUsers()` 를 불렀다. 일괄 버튼이 N명을 forEach 로 동시에
   * 쏘면 목록을 **N번** 다시 읽었고, 그 N개의 요청은 서로를 취소·덮어쓰며 경합했다
   * (`invalidateQueries` 의 refetch 는 `cancelRefetch: true` 가 기본이다). 그래서 무효화는
   * **마지막으로 끝난 토글 하나만** 돌린다 — 아래 `inFlightToggles` 가 그 판정이다.
   *
   * ⚠️ `queryClient.isMutating()` 으로는 이 판정을 할 수 없다. Mutation 은 `onSettled` 를
   *    **await 한 뒤에야** `{type:'success'}` 를 dispatch 하므로(query-core/mutation.js),
   *    동시에 끝난 변이들이 서로를 여전히 'pending' 으로 보고 **아무도** 무효화하지 않는다.
   *    실측으로 확인했다(재조회 0회). ref 카운터는 mutate 호출 시점에 동기적으로 오르므로
   *    그 경주가 없다.
   */
  const inFlightToggles = useRef(0);

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ userId, currentStatus }: { userId: string; currentStatus: boolean }) =>
      apiPatch(`/api/users/${userId}`, { isActive: !currentStatus }),
    onSuccess: (_data, { currentStatus }) => {
      toast({
        title: '상태 변경 완료',
        description: `사용자 계정이 ${!currentStatus ? '활성화' : '비활성화'} 되었습니다.`,
      });
    },
    onError: () => {
      // 서버 메시지를 쓰지 않는 것은 의도다 — 예전 catch 가 원인과 무관하게 늘 같은 문장을
      // 보여 줬다. 일괄 처리에서 실패한 사람 수만큼 뜨는 것도 그대로다.
      toast({
        title: '오류 발생',
        description: '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      inFlightToggles.current -= 1;
      if (inFlightToggles.current > 0) return;
      queryClient.invalidateQueries({ queryKey: qk.users.all });
    },
  });

  const handleToggleActive = (userId: string, currentStatus: boolean) => {
    // 카운터는 여기서 올린다. onMutate 안이 아니라 mutate 호출부인 이유는, 일괄 버튼의
    // forEach 가 N번 도는 **동안** 이미 N 이 되어 있어야 첫 응답이 성급하게 무효화하지
    // 않기 때문이다.
    inFlightToggles.current += 1;
    toggleActive({ userId, currentStatus });
  };

  const handleToggleAll = () => {
    if (selectedUserIds.size === users.length && users.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map((u) => u.id)));
    }
  };

  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleUserSaved = () => {
    refreshUsers();
    setIsUserDialogOpen(false);
  };

  const handleRolesAssigned = () => {
    refreshUsers();
    setIsAssignRoleDialogOpen(false);
  };

  const handleUserDeleted = () => {
    refreshUsers();
    setIsDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  /**
   * 표에 "로딩 중..." 을 띄울지.
   *
   * `isFetching`(재조회 포함)이 아니라 `isPending`(첫 로딩)이다. 예전 `loading` state 는
   * 재조회에도 켜져서 페이지를 넘기거나 상태를 토글할 때마다 표가 통째로 사라졌다 나타났지만,
   * 위 keepPreviousData 와 무효화가 이전 결과를 남겨 두므로 그 깜빡임 없이 갱신된다
   * (roles 화면이 같은 판단을 이미 했다).
   */
  const loading = usersPending;

  // 권한이 없으면 "데이터가 없다" 로 위장하지 않고 그렇다고 말한다.
  // 메뉴는 permission 으로 게이트되지만(config/navigation.ts) URL 직접 접근은 남는다.
  if (accessDenied) {
    return (
      <div className="space-y-6">
        <div className="sr-card-template">
          <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
              사용자 목록
            </h3>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <p className="text-muted-foreground">사용자 목록을 볼 권한이 없습니다.</p>
            <p className="text-sm text-muted-foreground">
              필요하면 시스템 관리자에게 권한을 요청하세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sr-card-template">
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))] space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
              사용자 목록
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {/* 일괄 작업 버튼 - 선택 시에만 표시 */}
              {selectedUserIds.size > 0 &&
                (() => {
                  // 선택된 사용자들의 상태 분석
                  const selectedUsers = users.filter((u) => selectedUserIds.has(u.id));
                  const hasActiveUsers = selectedUsers.some((u) => u.isActive);
                  const hasInactiveUsers = selectedUsers.some((u) => !u.isActive);
                  const allInactive = selectedUsers.every((u) => !u.isActive);

                  return (
                    <div className="flex items-center gap-2 mr-2 px-3 py-1.5 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground font-medium">
                        {selectedUserIds.size}명 선택
                      </span>

                      {/* 역할 관리 - 1명 선택 시에만 활성화 */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={selectedUserIds.size !== 1}
                        title={selectedUserIds.size !== 1 ? '1명만 선택해주세요' : '역할 관리'}
                        onClick={() => {
                          const firstUserId = Array.from(selectedUserIds)[0];
                          const user = users.find((u) => u.id === firstUserId);
                          if (user) handleAssignRoles(user);
                        }}
                      >
                        역할 관리
                      </Button>

                      {/* 일괄 활성화 - 비활성 사용자가 있을 때만 표시 */}
                      {hasInactiveUsers && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-green-600 hover:bg-green-50"
                          onClick={() => {
                            // handleToggleActive 는 "현재 상태"를 받아 반대로 뒤집는다.
                            // 원하는 상태(true)를 넘기면 isActive: !true = false 가 전송되어
                            // 비활성 사용자가 그대로 비활성으로 남는다(무동작). 단일 행 호출부
                            // (UserActions.tsx:59)와 동일하게 u.isActive 를 넘겨야 한다.
                            selectedUsers
                              .filter((u) => !u.isActive)
                              .forEach((u) => handleToggleActive(u.id, u.isActive));
                          }}
                        >
                          일괄 활성화
                        </Button>
                      )}

                      {/* 일괄 비활성화 - 활성 사용자가 있을 때만 표시 */}
                      {hasActiveUsers && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-orange-600 hover:bg-orange-50"
                          onClick={() => {
                            // 위와 동일한 이유. 원하는 상태(false)를 넘기면
                            // isActive: !false = true 가 전송되어 활성 사용자가 활성으로 남는다.
                            selectedUsers
                              .filter((u) => u.isActive)
                              .forEach((u) => handleToggleActive(u.id, u.isActive));
                          }}
                        >
                          일괄 비활성화
                        </Button>
                      )}

                      {/* 삭제 - 비활성 사용자만 선택 시 활성화 */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        disabled={!allInactive}
                        title={
                          !allInactive
                            ? '비활성 사용자만 삭제 가능합니다. 먼저 비활성화하세요.'
                            : '선택한 사용자 삭제'
                        }
                        onClick={() => {
                          const firstUserId = Array.from(selectedUserIds)[0];
                          const user = users.find((u) => u.id === firstUserId);
                          if (user) {
                            setUserToDelete(user);
                            setIsDeleteDialogOpen(true);
                          }
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  );
                })()}
              {/*
                권한 게이트가 없어 CLIENT_USER·ENGINEER 에게도 버튼이 보였다. 서버가 POST 를
                403 으로 막으므로 데이터가 새지는 않았지만, 누르면 반드시 실패하는 버튼이다.
                서버와 **같은 규칙**(USER:CREATE, ADMIN 은 우회)으로 판정한다.
              */}
              {canCreateUser && (
                <Button onClick={handleCreateUser} className="sr-btn-template-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  사용자 등록
                </Button>
              )}
            </div>
          </div>

          {/* 필터 영역 - 데스크톱/모바일 최적화 */}
          <div className="flex flex-col gap-2">
            {/* Status Tabs (Mobile: Scrollable / Desktop: Flex) */}
            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar -mx-2 px-2 md:mx-0 md:px-0">
              {[
                { label: '활성', value: 'true' },
                { label: '비활성', value: 'false' },
                { label: '전체', value: 'all' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => handleStatusChange(tab.value)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all border ${
                    statusFilter === tab.value
                      ? 'bg-[hsl(var(--sr-primary-dark))] text-black border-[hsl(var(--sr-primary-dark))] shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="이름, 이메일 검색..."
                  className="pl-9 h-9 text-sm bg-background rounded-full border-muted-foreground/20 focus-visible:ring-primary/20"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                className="h-9 px-4 rounded-full bg-[hsl(var(--sr-primary-dark))] text-black hover:bg-[hsl(var(--sr-primary-dark))]/90 shrink-0"
              >
                검색
              </Button>
            </form>
          </div>
        </div>

        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end bg-card/50">
          <div className="text-xs text-muted-foreground font-medium">
            전체{' '}
            <span className="text-[hsl(var(--sr-primary-dark))] font-bold">
              {pagination.totalItems}
            </span>
            명
          </div>
        </div>

        <UserTable
          users={users}
          loading={loading}
          searchQuery={searchQuery}
          selectedUserIds={selectedUserIds}
          clients={clients}
          onToggleAll={handleToggleAll}
          onToggleUser={handleToggleUser}
          onRefresh={refreshUsers}
        />

        <UserMobileList
          users={users}
          loading={loading}
          searchQuery={searchQuery}
          selectedUserIds={selectedUserIds}
          clients={clients}
          onToggleUser={handleToggleUser}
          onAssignRoles={handleAssignRoles}
          onToggleActive={handleToggleActive}
          onDelete={handleDeleteUser}
          onRefresh={refreshUsers}
        />

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center py-4 border-t border-[hsl(var(--sr-border))]">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {pagination.currentPage} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage === pagination.totalPages}
              >
                다음
              </Button>
            </div>
          </div>
        )}
      </div>

      <UserDialog
        open={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        user={selectedUser}
        clients={clients}
        onSaved={handleUserSaved}
      />

      <AssignRolesDialog
        open={isAssignRoleDialogOpen}
        onOpenChange={setIsAssignRoleDialogOpen}
        user={selectedUser}
        availableRoles={roles}
        onSaved={handleRolesAssigned}
      />

      <DeleteUserDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        user={userToDelete}
        onDeleted={handleUserDeleted}
      />
    </div>
  );
}
