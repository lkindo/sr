'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Building2, Plus, Search, Users } from 'lucide-react';

import { ClientDialog } from '@/components/clients/ClientDialog';
import {
  type Client,
  OrganizationTree,
  type User,
} from '@/components/organization/OrganizationTree';
import { UserReassignDialog } from '@/components/organization/UserReassignDialog';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { UserDialog } from '@/components/users/UserDialog';
import { useDebounce } from '@/hooks/use-debounce';
import { useToast } from '@/hooks/use-toast';
import {
  ApiError,
  apiGet,
  apiList,
  apiPatch,
  buildQuery,
  retryUnlessClientError,
} from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

/**
 * `/api/clients/[id]` 응답. 목록 봉투를 쓰지 않는 예외 라우트라 bare object 다.
 * 이 화면은 그중 `users` 만 쓴다.
 */
interface ClientDetail {
  users?: User[];
}

/** `/api/users/[id]/client` 응답 본문. 성공 본문과 409 에러 본문이 같은 모양이다. */
interface ReassignBody {
  data?: {
    ongoingSRs?: any[];
    ongoingSRsHandled?: number;
  };
}

/**
 * 소속 변경의 결과. **409 는 실패가 아니다** — 확인이 필요한 상태다.
 * 그래서 에러가 아니라 값으로 표현한다(아래 mutationFn 주석 참조).
 */
type ReassignOutcome =
  { needsForce: true; ongoingSRs: any[] } | { needsForce: false; body: ReassignBody | undefined };

/**
 * 소속 변경 변이의 입력. 성공 토스트가 쓰는 이름까지 함께 싣는다 — `onSuccess` 가
 * 재조회를 기다리는 동안 다이얼로그 state 를 다시 읽지 않아도 되게 하기 위해서다.
 */
interface ReassignVariables {
  userId: string;
  targetClientId: string;
  userName: string;
  targetClientName: string;
  force: boolean;
}

/** 조직 트리는 페이지네이션 없이 전량을 그린다. 키와 URL 이 같은 객체에서 나오도록 묶어 둔다. */
const CLIENT_LIST_PARAMS = { pageSize: 1000 };

/**
 * 목록이 아직 없을 때 쓰는 빈 배열. **상수여야 한다.**
 * 아래 검색 자동 펼침 effect 가 `clients` 를 deps 에 물고 있어서, 렌더마다 새 `[]` 를
 * 만들면 effect 가 매 렌더 돌며 `setExpandedClients` 로 자기 자신을 다시 깨운다.
 */
const EMPTY_CLIENTS: Client[] = [];

export default function OrganizationPage() {
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  // 드래그 앤 드롭 관련 상태
  const [isReassignDialogOpen, setIsReassignDialogOpen] = useState(false);
  const [reassignData, setReassignData] = useState<{
    userId: string;
    userName: string;
    sourceClientId: string;
    sourceClientName: string;
    targetClientId: string;
    targetClientName: string;
  } | null>(null);
  const [ongoingSRs, setOngoingSRs] = useState<any[]>([]);
  const [showWarning, setShowWarning] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * 고객사 목록.
   *
   * 로딩 표시는 `isPending`(첫 조회)이다. 예전 `fetchClients()` 는 저장·상태변경 뒤 재조회에도
   * `setLoading(true)` 를 걸어 화면 전체를 '로딩 중...' 으로 덮었지만, 무효화는 캐시를 남겨 둔
   * 채 배경에서 다시 가져오므로 트리가 보이는 상태 그대로 갱신된다.
   *
   * `placeholderData: keepPreviousData` + `staleTime: 0` 은 목록 관례다. 이 화면은 파라미터가
   * 고정(pageSize=1000)이라 키가 바뀔 일이 없지만, 재조회 동안 이전 data 를 그대로 들고 있는
   * 성질이 아래 소속 변경 성공 경로가 `Promise.all` 로 전부 모아 한 번에 setState 하며 막던
   * 그 깜빡임을 대신 막아 준다.
   */
  const {
    data: clientPage,
    isPending,
    error: clientsError,
  } = useQuery({
    queryKey: qk.clients.list(CLIENT_LIST_PARAMS),
    // 예전 `Array.isArray(result) ? result : result.data || []` 삼항식은 apiList 가 흡수했다.
    queryFn: ({ signal }) =>
      apiList<Client>(`/api/clients${buildQuery(CLIENT_LIST_PARAMS)}`, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 0,
    // 4xx 는 다시 물어봐도 같다. 전역 기본값 retry:1 이면 오류 토스트가 한 박자 늦게 뜬다.
    retry: retryUnlessClientError,
  });

  const clients = clientPage?.data ?? EMPTY_CLIENTS;

  /**
   * 조회 실패 토스트. v5 의 `useQuery` 에는 `onError` 가 없어 effect 로 옮겼다.
   * `error` 는 실패마다 새 객체이므로 실패 1회당 정확히 한 번 뜬다 — 기존 catch 와 같다.
   */
  useEffect(() => {
    if (!clientsError) return;
    toast({
      title: '오류',
      description: '고객사 목록을 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
  }, [clientsError, toast]);

  const clientIds = useMemo(() => clients.map((client) => client.id), [clients]);

  /**
   * 행 확장 지연로딩.
   *
   * 예전에는 `toggleClient` 안에서 직접 fetch 해 `clientUsers` dict(state)에 손으로 쌓았다.
   * 행마다 쿼리를 하나 띄우면 그 dict 가 곧 캐시가 된다 — 접었다 펴도 즉시 보이고,
   * 무효화 한 줄이 펼쳐진 행 전부를 병렬로 다시 가져온다(예전의 직렬 for 루프 자리).
   *
   * ⚠️ **펼쳐진 고객사만이 아니라 전체 고객사에 쿼리를 걸고 `enabled` 로 여닫는다.**
   *    (`clients/page.tsx` 는 펼쳐진 id 만 map 한다 — 그쪽은 접으면 잊어도 되기 때문이다.)
   *    여기서는 아래 검색 자동 펼침 effect 가 **접힌 고객사의 사용자 이름까지** 훑는다.
   *    쿼리를 접을 때 걷어내면 dict 에서 항목이 사라져, 한 번 펼쳤던 고객사의 사용자를
   *    검색해도 더 이상 펼쳐지지 않는다 — 예전 dict 는 항목을 지운 적이 없다.
   *    `enabled:false` 인 관찰자는 요청을 보내지 않으면서 캐시에 있는 값은 그대로 준다.
   *
   * 실패는 토스트로 알린다(예전 catch 의 계약). `retry: false` 인 이유는 예전에도 요청이
   * 정확히 한 번이었기 때문이다.
   */
  const { clientUsers, failedClientIds } = useQueries({
    queries: clientIds.map((clientId) => ({
      queryKey: qk.clients.users(clientId),
      // ⚠️ 이 라우트는 bare object 를 준다. 봉투를 벗기는 apiList 가 아니라 apiGet 이다.
      queryFn: () => apiGet<ClientDetail>(`/api/clients/${clientId}`),
      enabled: expandedClients.has(clientId),
      retry: false,
    })),
    // 트리가 `Record<clientId, users[]>` 를 받으므로 여기서 조립한다. 반환값은 React Query 가
    // 이전 결과와 deep-equal 비교해 참조를 유지해 준다 — 아래 effect 의 deps 가 이 객체다.
    combine: (results) => {
      const dict: Record<string, User[]> = {};
      const failed: string[] = [];
      results.forEach((result, index) => {
        const clientId = clientIds[index]!;
        // 아직 안 왔거나 실패한 행은 키를 만들지 않는다 — 트리가 그걸 '로딩 중' 으로 읽는다.
        if (result.data) dict[clientId] = result.data.users ?? [];
        if (result.isError) failed.push(clientId);
      });
      return { clientUsers: dict, failedClientIds: failed };
    },
  });

  /**
   * 사용자 조회 실패 토스트.
   *
   * 예전에는 `response.ok` 가 false 면 **아무 일도 일어나지 않았고**(행이 영원히 '로딩 중'),
   * 네트워크 오류일 때만 토스트가 떴다. 그 침묵은 의도가 아니다 — 바로 위 주석이
   * "에러는 toast로 사용자에게 표시" 라고 적어 두고 있었다. 이제 두 경우 모두 알린다.
   */
  useEffect(() => {
    if (failedClientIds.length === 0) return;
    toast({
      title: '오류',
      description: '사용자 정보를 불러오는데 실패했습니다.',
      variant: 'destructive',
    });
  }, [failedClientIds, toast]);

  /**
   * 고객사·소속 사용자 캐시를 한꺼번에 갱신한다.
   * `qk.clients.all`(=['clients'])은 목록 키와 행 확장 키 양쪽의 접두사라 한 번으로 둘 다 잡는다.
   */
  const refreshOrganization = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.clients.all }),
    [queryClient]
  );

  const toggleClient = (clientId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      // 데이터 조회는 위 쿼리의 `enabled` 가 대신한다. 이미 캐시에 있으면 요청도 없다.
      newExpanded.add(clientId);
    }
    setExpandedClients(newExpanded);
  };

  const handleAddClient = () => {
    setIsClientDialogOpen(true);
  };

  const handleAddUser = (clientId: string) => {
    setSelectedClient(clientId);
    setIsUserDialogOpen(true);
  };

  const handleClientSaved = () => {
    refreshOrganization();
    setIsClientDialogOpen(false);
  };

  const handleUserSaved = () => {
    refreshOrganization();
    setIsUserDialogOpen(false);
    setSelectedClient(null);
  };

  const toggleClientStatusMutation = useMutation({
    mutationFn: ({ clientId, isActive }: { clientId: string; isActive: boolean }) =>
      apiPatch<unknown>(
        `/api/clients/${clientId}`,
        { isActive },
        { fallbackMessage: 'Failed to update client status' }
      ),
  });

  /**
   * 사용자 활성/비활성 토글.
   *
   * ⚠️ `isActive` 는 **현재 상태**다. 보내는 값은 `!isActive` — 위 고객사 토글과 같은 모양이고,
   *    `UsersClient.tsx` 의 `handleToggleActive(u.id, u.isActive)` 와도 같은 관례다.
   *    호출부가 "원하는 상태" 를 넘기면 뒤집혀 무동작이 되니 주의한다.
   *
   * 예전에는 `{ isActive: undefined }` 를 보냈다. `JSON.stringify` 가 undefined 값의 키를
   * 통째로 지우므로 실제로 나간 본문은 `{}` 였고("Toggle will be handled by API" 라는 주석과
   * 달리 `/api/users/[id]` PATCH 는 토글이 아니라 값을 받는다) 메뉴는 아무것도 바꾸지 않은 채
   * 성공 토스트만 띄웠다. 그래서 현재 값을 인자로 받아 여기서 뒤집는다.
   */
  const toggleUserStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiPatch<unknown>(
        `/api/users/${userId}`,
        { isActive: !isActive },
        { fallbackMessage: 'Failed to update user status' }
      ),
  });

  // 고객사 상태 변경 핸들러
  const handleToggleClientStatus = async (clientId: string) => {
    try {
      const client = clients.find((c) => c.id === clientId);
      if (!client) return;

      await toggleClientStatusMutation.mutateAsync({ clientId, isActive: !client.isActive });

      // 예전 `await fetchClients()` 자리. 재조회를 기다린 뒤 토스트를 띄우는 순서를 유지한다.
      await refreshOrganization();
      toast({
        title: '성공',
        description: `${client.name}이(가) ${client.isActive ? '비활성화' : '활성화'}되었습니다.`,
      });
    } catch {
      // 여기서 다시 throw 하지 않는다. 호출자(ClientCardContextMenu)는 성공했다고 보고
      // 자기 토스트를 한 번 더 띄우는데, 그게 기존 동작이다.
      toast({
        title: '오류',
        description: '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  // 사용자 상태 변경 핸들러. `isActive` 는 카드가 보여 주고 있는 **현재 상태**다.
  const handleToggleUserStatus = async (userId: string, isActive: boolean) => {
    try {
      await toggleUserStatusMutation.mutateAsync({ userId, isActive });

      // 예전에는 목록을 다시 가져온 뒤 **펼쳐진 고객사를 for 루프로 하나씩** 다시 조회했다
      // (직렬 N+1). 무효화 한 줄이 그 일을 대신하고, 활성 쿼리만 병렬로 다시 돈다.
      await refreshOrganization();

      toast({
        title: '성공',
        description: '사용자 상태가 변경되었습니다.',
      });
    } catch {
      // 위 고객사 토글과 같은 이유로 삼킨다(UserCardContextMenu 가 자기 토스트를 띄운다).
      toast({
        title: '오류',
        description: '상태 변경 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (_event: DragStartEvent) => {
    // 드래그 시작 시 추가 처리 (필요시)
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // 드래그 오버 시 추가 처리 (필요시)
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // 드롭 영역이 없거나 유효하지 않으면 무시
    if (!over || !active) return;

    const userId = active.data.current?.userId as string;
    const sourceClientId = active.data.current?.sourceClientId as string;
    const user = active.data.current?.user;
    const targetClientId = over.data.current?.clientId as string;

    // 드래그한 항목이 사용자가 아니면 무시
    if (!userId || !user) return;

    // 같은 고객사로 드롭하면 무시
    if (sourceClientId === targetClientId) {
      toast({
        title: '알림',
        description: '같은 고객사로는 이동할 수 없습니다.',
        variant: 'default',
      });
      return;
    }

    // 고객사 정보 찾기
    const sourceClient = clients.find((c) => c.id === sourceClientId);
    const targetClient = clients.find((c) => c.id === targetClientId);

    if (!sourceClient || !targetClient) {
      toast({
        title: '오류',
        description: '고객사 정보를 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    // 확인 모달 열기
    setReassignData({
      userId,
      userName: user.name,
      sourceClientId,
      sourceClientName: sourceClient.name,
      targetClientId,
      targetClientName: targetClient.name,
    });
    // 상태 초기화
    setOngoingSRs([]);
    setShowWarning(false);
    setIsReassignDialogOpen(true);
  };

  /**
   * 소속 변경.
   *
   * ── 409 를 왜 mutationFn 안에서 잡는가 ──────────────────────────────────────
   * 진행 중인 SR 이 있으면 서버가 409 + `code: 'ONGOING_SRS'` 로 거절하는데, 이건 **에러가 아니라
   * UI 상태**다. 사용자에게 SR 목록을 보여 주고 "그래도 옮기겠다"(force)를 받아야 한다.
   * 그대로 `onError` 로 흘리면 경고 UI 대신 오류 토스트가 뜨고 끝난다 — 기존 동작의 회귀다.
   * 그래서 409 만 정상 반환값(`needsForce`)으로 바꿔 `onSuccess` 에서 분기한다.
   */
  const reassignMutation = useMutation<ReassignOutcome, Error, ReassignVariables>({
    mutationFn: async ({ userId, targetClientId, force }) => {
      try {
        const body = await apiPatch<ReassignBody | undefined>(
          `/api/users/${userId}/client`,
          { clientId: targetClientId, force },
          { fallbackMessage: 'Failed to reassign user' }
        );
        return { needsForce: false, body };
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.code === 'ONGOING_SRS') {
          const conflict = error.body as ReassignBody | undefined;
          return { needsForce: true, ongoingSRs: conflict?.data?.ongoingSRs || [] };
        }
        throw error;
      }
    },
    onSuccess: async (outcome, variables) => {
      // 진행 중인 SR이 있어 서버가 거부한 경우 - 경고를 표시하고 강제 이동을 유도
      if (outcome.needsForce) {
        setOngoingSRs(outcome.ongoingSRs);
        setShowWarning(true);
        return;
      }

      // 예전에는 목록과 양쪽 고객사의 사용자를 `Promise.all` 로 전부 모은 뒤 한 번에
      // setState 했다("깜빡임 방지"). React Query 는 재조회 동안 이전 data 를 그대로 들고
      // 있으므로 무효화 한 줄로 같은 결과가 난다. `await` 하는 이유는 예전처럼 **갱신이 끝난
      // 뒤에** 성공 토스트와 다이얼로그 닫기가 오게 하기 위해서다(그동안 버튼은 계속 비활성).
      await refreshOrganization();

      const handled = outcome.body?.data?.ongoingSRsHandled ?? 0;
      toast({
        title: '성공',
        description: `${variables.userName}이(가) ${variables.targetClientName}(으)로 이동되었습니다.${handled > 0 ? ` (진행 중인 SR ${handled}건 유지됨)` : ''}`,
      });

      // 다이얼로그 닫기 및 상태 초기화
      setIsReassignDialogOpen(false);
      setReassignData(null);
      setOngoingSRs([]);
      setShowWarning(false);
    },
    onError: (error) => {
      const errorMessage =
        error instanceof Error ? error.message : '소속 변경 중 오류가 발생했습니다.';
      toast({
        title: '오류',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // 소속 변경 확인
  const handleConfirmReassign = (force: boolean = false) => {
    if (!reassignData) return;

    reassignMutation.mutate({
      userId: reassignData.userId,
      targetClientId: reassignData.targetClientId,
      userName: reassignData.userName,
      targetClientName: reassignData.targetClientName,
      force,
    });
  };

  // 변이가 끝날 때까지 다이얼로그를 잠근다(예전 `isReassigning` state 자리).
  // `onSuccess` 가 재조회를 await 하므로 그동안에도 계속 true 다.
  const isReassigning = reassignMutation.isPending;

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // 검색어가 있을 때 일치하는 고객사 또는 해당 고객사의 사용자가 일치하는 경우 자동 펼침
  useEffect(() => {
    if (debouncedSearchQuery) {
      const matchingClientIds = new Set<string>();

      clients.forEach((client) => {
        // 고객사 이름이나 코드가 일치하면 펼침
        const clientMatches =
          client.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          client.code.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

        if (clientMatches) {
          matchingClientIds.add(client.id);
        }

        // 사용자 이름이나 이메일이 일치하면 해당 고객사 펼침
        const users = clientUsers[client.id] || [];
        const userMatches = users.some((uc: any) => {
          const user = uc.user || uc;
          return (
            user.name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            user.email?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
          );
        });

        if (userMatches) {
          matchingClientIds.add(client.id);
        }
      });

      // 내용이 같으면 이전 Set 을 그대로 둔다. 펼침이 바뀌면 위 행 쿼리 목록이 바뀌고,
      // 그 결과가 다시 이 effect 의 deps(`clientUsers`)로 돌아온다 — 매번 새 Set 을 넣으면
      // 그 고리가 멈출 이유가 없다.
      setExpandedClients((prev) =>
        prev.size === matchingClientIds.size && [...matchingClientIds].every((id) => prev.has(id))
          ? prev
          : matchingClientIds
      );
    }
  }, [debouncedSearchQuery, clients, clientUsers]);

  const filteredClients = clients.filter((client) =>
    debouncedSearchQuery
      ? client.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        client.code.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      : true
  );

  const totalUsers = clients.reduce((sum, client) => sum + (client._count?.users || 0), 0);
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.isActive).length;

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--sr-primary-dark))]">
            조직 구조
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            고객사 및 소속 사용자를 통합적으로 관리합니다.
          </p>
        </div>
        <div className="flex justify-start sm:justify-end shrink-0">
          <Button onClick={handleAddClient} className="sr-btn-template-primary w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            고객사 추가
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="sr-card-template p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">전체 고객사</p>
              <p className="text-2xl font-bold">{totalClients}</p>
            </div>
          </div>
        </div>

        <div className="sr-card-template p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-100">
              <Building2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">활성 고객사</p>
              <p className="text-2xl font-bold">{activeClients}</p>
            </div>
          </div>
        </div>

        <div className="sr-card-template p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">전체 사용자</p>
              <p className="text-2xl font-bold">{totalUsers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 조직 트리 */}
      <div className="sr-card-template">
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">조직 트리</h3>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="고객사 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <OrganizationTree
            clients={filteredClients}
            expandedClients={expandedClients}
            clientUsers={clientUsers}
            onToggleClient={toggleClient}
            onAddUser={handleAddUser}
            onToggleClientStatus={handleToggleClientStatus}
            onToggleUserStatus={handleToggleUserStatus}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            searchQuery={debouncedSearchQuery}
          />
        </div>
      </div>

      <ClientDialog
        open={isClientDialogOpen}
        onOpenChange={setIsClientDialogOpen}
        client={null}
        onSaved={handleClientSaved}
      />

      <UserDialog
        open={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        user={null}
        onSaved={handleUserSaved}
        defaultClientId={selectedClient || undefined}
      />

      {reassignData && (
        <UserReassignDialog
          open={isReassignDialogOpen}
          onOpenChange={(open) => {
            if (!isReassigning) {
              setIsReassignDialogOpen(open);
              if (!open) {
                setReassignData(null);
                setOngoingSRs([]);
                setShowWarning(false);
              }
            }
          }}
          userName={reassignData.userName}
          sourceClientName={reassignData.sourceClientName}
          targetClientName={reassignData.targetClientName}
          onConfirm={handleConfirmReassign}
          isLoading={isReassigning}
          ongoingSRs={ongoingSRs}
          showWarning={showWarning}
        />
      )}
    </div>
  );
}
