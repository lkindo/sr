'use client';

import React, { useEffect, useState } from 'react';
import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';

import { ClientDialog } from '@/components/clients/ClientDialog';
import { ClientMobileList } from '@/components/clients/ClientMobileList';
import { ClientTable } from '@/components/clients/ClientTable';
import { ClientUsersSheet } from '@/components/clients/ClientUsersSheet';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiList, buildQuery, retryUnlessClientError } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

interface Client {
  id: string;
  code: string;
  name: string;
  industry?: string;
  contactPerson?: string;
  contactEmail?: string;
  isActive: boolean;
  _count?: {
    users: number;
    srs: number;
  };
}

/**
 * 행 확장이 읽는 `/api/clients/[id]` 응답 중 필요한 부분만.
 *
 * 이 라우트는 목록 봉투(`{data, meta}`)를 쓰지 않는 예외다(src/lib/pagination.ts 상단 참조).
 */
interface ClientDetail {
  users?: Array<{ user: { id: string; name: string; email: string } }>;
}

/** `client.users[]` 한 칸. 표는 `uc.user` 를 읽으므로 이 형태 그대로 넘긴다. */
type ClientUserLink = NonNullable<ClientDetail['users']>[number];

/** 페이지 크기는 UI 로 바꿀 수 없다. 예전 pagination state 에서도 10 으로 고정이었다. */
const PAGE_SIZE = 10;

export default function ClientsPage() {
  const { hasPermission, isAdmin } = usePermissions();

  // 서버(src/lib/policies.ts 의 canCreateClient)와 같은 규칙이다: ADMIN 이거나 CLIENT:CREATE.
  const canCreateClient = isAdmin() || hasPermission('CLIENT', 'CREATE');

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isUsersSheetOpen, setIsUsersSheetOpen] = useState(false);
  const [selectedClientForUsers, setSelectedClientForUsers] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Pagination & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * queryKey 와 URL 을 **같은 객체**에서 파생시킨다. 두 곳에 따로 적으면 조회하는 키와
   * 실제로 요청한 URL 이 조용히 어긋난다.
   *
   * `undefined` 는 buildQuery 가 키째 빼므로 'all' 필터와 빈 검색어는 URL 에 나타나지
   * 않는다 — 예전 `if (searchQuery)` / `if (industryFilter !== 'all')` 와 같은 결과다.
   */
  const listParams = {
    page,
    pageSize: PAGE_SIZE,
    search: searchQuery || undefined,
    industry: industryFilter === 'all' ? undefined : industryFilter,
    isActive: statusFilter === 'all' ? undefined : statusFilter,
  };

  /**
   * 고객사 목록.
   *
   * ── 예전에 여기 있던 수동 AbortController 이야기 ────────────────────────────
   * 검색 입력에는 디바운스가 없어 **키 입력마다** 요청이 나간다. 취소가 없으면 'TEST00'
   * 응답이 'TEST001' 응답보다 늦게 도착해 필터 결과를 덮어썼다 — 검색창에는 'TEST001' 이
   * 있는데 표에는 전체 목록이 떠 있는 상태가 된다. 실제로 E2E 09번('검색어를 넣으면 그
   * 고객사만 남는다')이 그렇게 산발 실패했고, 그래서 `inFlightRef` 로 이전 요청을 abort 하고
   * `finally` 에서 "자기 요청일 때만" 로딩을 끄는 가드를 달았다(커밋 c95334e).
   *
   * React Query 는 그 경합을 **구조적으로** 없앤다. 응답은 자기 queryKey 의 캐시에만 들어가고
   * 화면은 현재 키의 캐시만 본다. 늦게 온 'TEST00' 응답이 'TEST001' 화면을 덮을 경로가
   * 아예 없다. 언마운트 정리도 관찰자가 사라지면 자동이다.
   *
   * 다만 그 이득은 아래 세 옵션에 달려 있다. 하나라도 빠지면 옛 버그가 형태만 바꿔 돌아온다:
   *
   *  1. `signal` 을 queryFn 에 넘긴다. 넘기지 않으면 React Query 는 취소를 시도조차 하지
   *     않는다(signal 을 쓴 적 없는 queryFn 은 재시도만 멈춘다). 키 입력마다 뜬 요청이
   *     전부 끝까지 살아남는다 — 결과는 안전하지만 네트워크가 예전보다 나빠진다.
   *  2. 로딩 표시는 `isPending`(첫 조회)이다. `isFetching` 을 물리면 검색어를 칠 때마다 표가
   *     '로딩 중...' 으로 바뀌는데, 그게 바로 위 `finally` 가드가 막던 깜빡임이다.
   *  3. `placeholderData: keepPreviousData`. 없으면 검색어가 바뀔 때마다 표가 빈 상태를
   *     거쳐 간다(예전보다 나쁘다).
   */
  const {
    data: clientPage,
    isPending: loading,
    error,
  } = useQuery({
    queryKey: qk.clients.list(listParams),
    queryFn: async ({ signal }) => {
      const result = await apiList<Client>(`/api/clients${buildQuery(listParams)}`, { signal });
      // 예전 fetch 경로의 방어를 그대로 남긴다. 봉투가 깨진 응답을 성공으로 받으면 표가
      // 조용히 빈 채로 남아 원인을 찾을 단서가 없다.
      if (!result?.data || !result.meta) throw new Error('Invalid response format');
      return result;
    },
    placeholderData: keepPreviousData,
    /**
     * 목록은 항상 신선해야 한다. 전역 staleTime 60초를 그대로 두면 방금 만든 고객사가
     * 목록에 안 잡히는 것처럼 보인다.
     *
     * ⚠️ 이 값은 E2E 09번의 계약이기도 하다. 그 테스트는 fill 직후가 아니라
     *    `search=TEST001` 인 **응답**을 기다린 뒤 단언하는데, 캐시가 신선하다고 판단되면
     *    React Query 는 요청을 아예 보내지 않아 그 대기가 타임아웃난다.
     */
    staleTime: 0,
    // 403 은 다시 물어봐도 403 이다(CLIENT_USER 는 이 API 가 통째로 403 이다 — E2E 09번의
    // 'CLIENT_USER 경계' 참조). 전역 기본값 retry:1 이면 오류 토스트가 한 박자 늦게 뜬다.
    retry: retryUnlessClientError,
  });

  const clients = clientPage?.data ?? [];
  const totalItems = clientPage?.meta.totalItems ?? 0;
  const totalPages = clientPage?.meta.totalPages ?? 0;

  /**
   * 조회 실패 토스트. v5 의 useQuery 에는 `onError` 가 없어 effect 로 옮겼다.
   * `error` 는 실패마다 새 객체이므로 실패 1회당 정확히 한 번 뜬다 — 기존 catch 와 같다.
   *
   * 취소는 여기로 오지 않는다. React Query 는 abort 된 요청을 에러가 아니라 취소로 처리하므로,
   * 예전 코드가 `AbortError` 를 걸러내며 남긴 이유("오류 토스트를 띄우면 사용자가 타이핑할
   * 때마다 실패 알림을 보게 된다")가 구조적으로 지켜진다.
   */
  useEffect(() => {
    if (!error) return;
    toast({
      title: '오류',
      description: '고객사 목록을 불러오지 못했습니다.',
      variant: 'destructive',
    });
  }, [error, toast]);

  const expandedIds = Array.from(expandedRows);

  /**
   * 행 확장 지연로딩.
   *
   * 예전에는 toggleRowExpansion 안에서 직접 fetch 하고 `clientUsers` dict(state)에 손으로
   * 쌓았다. 펼쳐진 행마다 쿼리를 하나 띄우면 그 dict 가 곧 캐시가 된다 — 접었다 다시 펴도
   * 캐시에 있으면 즉시 보이고(전역 gcTime 5분), 화면을 떠나면 함께 정리된다.
   *
   * 에러는 **무음이다**(기존 `catch {}` 계약). 사용자가 명시적으로 요청한 조회가 아니라
   * 실패를 알릴 자리가 없고, 실패하면 예전과 똑같이 '등록된 사용자가 없습니다.' 로 보인다.
   * `retry: false` 도 같은 이유다 — 보이지 않는 실패를 전역 기본값으로 한 번 더 시도해 봐야
   * 사용자에게 달라지는 것이 없다(예전에도 요청은 정확히 한 번이었다).
   */
  const clientUsers = useQueries({
    queries: expandedIds.map((clientId) => ({
      queryKey: qk.clients.users(clientId),
      // ⚠️ 이 라우트는 bare object 를 준다. 봉투를 벗기는 apiList 가 아니라 apiGet 이다.
      queryFn: () => apiGet<ClientDetail>(`/api/clients/${clientId}`),
      retry: false,
    })),
    // 표 두 개(데스크톱/모바일)가 `Record<clientId, users[]>` 를 받으므로 여기서 조립한다.
    combine: (results) =>
      results.reduce<Record<string, ClientUserLink[]>>((dict, result, index) => {
        // 아직 안 왔거나 실패한 행은 키를 만들지 않는다. 표가 `|| []` 로 받아 준다.
        if (result.data) dict[expandedIds[index]!] = result.data.users ?? [];
        return dict;
      }, {}),
  });

  const handleCreateClient = () => {
    setSelectedClient(null);
    setIsClientDialogOpen(true);
  };

  const handleClientSaved = () => {
    // 예전 `fetchClients()` 자리. 무효화는 캐시를 남겨 둔 채 배경에서 다시 가져오므로
    // 표가 보이는 상태 그대로 갱신된다(위 `isPending` 주석과 짝이다).
    // `qk.clients.all` 은 목록 키와 행 확장 키 양쪽의 접두사라 한 번으로 둘 다 갱신된다.
    queryClient.invalidateQueries({ queryKey: qk.clients.all });
    setIsClientDialogOpen(false);
  };

  const handleUsersClick = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClientForUsers({
      id: client.id,
      name: client.name,
    });
    setIsUsersSheetOpen(true);
  };

  /**
   * 펼침/접힘 토글.
   *
   * 조회는 여기서 하지 않는다 — 위 `useQueries` 가 이 집합을 보고 알아서 가져온다.
   * (예전에는 fetch 를 await 한 **뒤에** 행을 펼쳤다. 그래서 클릭 후 응답이 올 때까지
   *  아무 일도 일어나지 않는 것처럼 보였다. 이제 행은 즉시 펼쳐지고 사용자 목록만 뒤따른다.)
   */
  const toggleRowExpansion = (clientId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <div className="space-y-6">
      {/* 메인 컨텐츠 카드 */}
      <div className="sr-card-template">
        {/* 리스트 헤더 */}
        <div className="px-6 py-5 border-b border-[hsl(var(--sr-border))]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <h3 className="text-xl font-semibold text-[hsl(var(--sr-primary-dark))]">
              고객사 목록
            </h3>
            {/* 위 사용자 등록 버튼과 같은 이유 — 서버와 같은 규칙(CLIENT:CREATE)으로 판정한다. */}
            {canCreateClient && (
              <Button onClick={handleCreateClient} className="sr-btn-template-primary">
                <Plus className="mr-2 h-4 w-4" />
                등록
              </Button>
            )}
          </div>

          {/* 검색 및 필터 영역 - 데스크톱/모바일 최적화 */}
          <div className="flex flex-col gap-2 mt-2">
            {/* Industry Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar -mx-2 px-2 md:mx-0 md:px-0">
              {[
                { label: '전체', value: 'all' },
                { label: 'IT', value: 'IT' },
                { label: '제조', value: 'MANUFACTURING' },
                { label: '금융', value: 'FINANCE' },
                { label: '서비스', value: 'SERVICE' },
                { label: '공공', value: 'PUBLIC' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => {
                    setIndustryFilter(tab.value);
                    setPage(1);
                  }}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all border ${
                    industryFilter === tab.value
                      ? 'bg-[hsl(var(--sr-primary-dark))] text-black border-[hsl(var(--sr-primary-dark))]'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Status Tabs & Search Bar */}
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex gap-1">
                {[
                  { label: '전체', value: 'all' },
                  { label: '활성', value: 'true' },
                  { label: '비활성', value: 'false' },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => {
                      setStatusFilter(tab.value);
                      setPage(1);
                    }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all border ${
                      statusFilter === tab.value
                        ? 'bg-[hsl(var(--sr-primary-dark))] text-black border-[hsl(var(--sr-primary-dark))] shadow-sm'
                        : 'bg-card text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 flex-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="고객사명, 코드로 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs bg-background rounded-full border-muted-foreground/20 focus-visible:ring-primary/20"
                  />
                </div>
                <Button
                  size="sm"
                  className="sr-btn-template-primary shrink-0 h-9 px-4 rounded-full"
                  onClick={() => setPage(1)}
                >
                  검색
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Total Count - 테이블 바로 위 */}
        <div className="px-6 py-2 border-b border-[hsl(var(--sr-border))] flex justify-end bg-card/50">
          <div className="text-xs text-muted-foreground font-medium">
            전체 <span className="text-[hsl(var(--sr-primary-dark))] font-bold">{totalItems}</span>
            개
          </div>
        </div>

        {/* Desktop View (Table) */}
        <ClientTable
          clients={clients}
          loading={loading}
          expandedRows={expandedRows}
          clientUsers={clientUsers}
          onToggleRowExpansion={toggleRowExpansion}
          onUsersClick={handleUsersClick}
          onCreateClient={handleCreateClient}
        />

        {/* Mobile View (Card List) */}
        <ClientMobileList
          clients={clients}
          loading={loading}
          expandedRows={expandedRows}
          clientUsers={clientUsers}
          onToggleRowExpansion={toggleRowExpansion}
          onUsersClick={handleUsersClick}
          onCreateClient={handleCreateClient}
        />

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center py-4 border-t border-[hsl(var(--sr-border))]">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
              >
                이전
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
              >
                다음
              </Button>
            </div>
          </div>
        )}
      </div>

      <ClientDialog
        open={isClientDialogOpen}
        onOpenChange={setIsClientDialogOpen}
        client={selectedClient}
        onSaved={handleClientSaved}
      />

      <ClientUsersSheet
        open={isUsersSheetOpen}
        onOpenChange={setIsUsersSheetOpen}
        clientId={selectedClientForUsers?.id || null}
        clientName={selectedClientForUsers?.name || ''}
      />
    </div>
  );
}
