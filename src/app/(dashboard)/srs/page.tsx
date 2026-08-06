import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { SRsDataTable } from '@/components/srs/SRsDataTable';
import { getCachedAssignableUsers, getCachedClients } from '@/lib/cache';
import { paginationSchema } from '@/lib/pagination';
import { INTERNAL_ROLES } from '@/lib/policies';
import { srService } from '@/services/sr.service';

type Props = {
  params: Promise<Record<string, unknown>>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Helper to parse search params
const getSearchParam = (param: string | string[] | undefined): string | undefined => {
  return Array.isArray(param) ? param[0] : param;
};

// 페이지 번호 상한 (과도한 OFFSET으로 인한 DB 부하 방지)
const MAX_PAGE = 10000;

/**
 * 이 화면이 제공하는 정렬 필드. 관계형 3개는 아래에서 중첩 객체로 따로 처리한다.
 */
const SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'srNumber',
  'title',
  'status',
  'actualPriority',
  'requestedPriority',
  'dueDate',
  'completedAt',
  'client',
  'requester',
  'assignee',
] as const;

type SortableField = (typeof SORTABLE_FIELDS)[number];

export default async function SRsPage({ searchParams }: Props) {
  const resolvedSearchParams = (await searchParams) || {};

  // 세션 정보 가져오기.
  // 필터 옵션(고객사·담당자) 조회가 세션 스코프에 의존하므로 가장 먼저 해석한다.
  // 예전에는 두 캐시 조회를 세션보다 먼저 시작했고, 그래서 스코프를 적용할 수 없었다.
  const session = await auth();
  const userRoles = session?.user?.roles || [];

  // ADMIN, MANAGER, ENGINEER가 아닌 경우 고객사 필터링
  const isAdminManagerEngineer = userRoles.some((role) => INTERNAL_ROLES.includes(role));

  // 고객사 사용자인 경우 해당 고객사의 SR만 조회
  // Optimized: Use clientIds from session instead of DB query
  const userClientIds: string[] = session?.user?.clientIds || [];

  // Start fetching filter options early (parallel execution).
  // 외부 사용자에게는 소속 고객사만 넘긴다 — `undefined`(전체)와 `[]`(없음)는 다르다.
  const clientsPromise = getCachedClients(isAdminManagerEngineer ? undefined : userClientIds);
  const usersPromise = getCachedAssignableUsers();

  // 페이지네이션 파라미터는 /api/srs와 동일한 검증 규칙(lib/pagination)을 공유합니다.
  // 잘못된 값(NaN, 0, 음수, 과도한 크기)은 안전한 기본값으로 대체되어 500/OOM을 방지합니다.
  const parsedPagination = paginationSchema.parse({
    page: getSearchParam(resolvedSearchParams.page),
    pageSize: getSearchParam(resolvedSearchParams.itemsPerPage),
  });
  const page = Math.min(parsedPagination.page, MAX_PAGE);
  const itemsPerPage = parsedPagination.pageSize;
  const sort = getSearchParam(resolvedSearchParams.sort) ?? 'createdAt.desc';
  const [rawSortField, sortOrder] = sort.split('.');
  // 임의의 컬럼명이 그대로 Prisma orderBy 로 들어가면 정렬 순서가 오라클이 된다
  // (감사 4.1 이 API 경로에서 지적한 것과 같은 결함이 이 SSR 페이지에도 있었다).
  // 화면이 실제로 제공하는 정렬만 허용하고, 나머지는 기본값으로 떨어뜨린다.
  const sortField = SORTABLE_FIELDS.includes(rawSortField as SortableField)
    ? (rawSortField as SortableField)
    : 'createdAt';

  const status = getSearchParam(resolvedSearchParams.status);
  const priority = getSearchParam(resolvedSearchParams.priority);
  const clientId = getSearchParam(resolvedSearchParams.clientId);
  const assigneeId = getSearchParam(resolvedSearchParams.assigneeId);
  const search = getSearchParam(resolvedSearchParams.search);
  const dateFrom = getSearchParam(resolvedSearchParams.dateFrom);
  const dateTo = getSearchParam(resolvedSearchParams.dateTo);

  const where: Prisma.SRWhereInput = {};

  if (status && status !== 'all')
    where.status = status as
      | 'REQUESTED'
      | 'INTAKE'
      | 'IN_PROGRESS'
      | 'ON_HOLD'
      | 'COMPLETED'
      | 'CONFIRMED'
      | 'REJECTED';
  if (priority && priority !== 'all')
    where.priority = priority as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  // clientId 필터 처리
  if (clientId && clientId !== 'all') {
    if (!isAdminManagerEngineer) {
      // 고객사 사용자인 경우, 요청한 clientId가 사용자의 고객사 목록에 있는지 확인
      if (userClientIds.length > 0 && userClientIds.includes(clientId)) {
        where.clientId = clientId;
      } else {
        // 권한이 없는 고객사 ID이거나 고객사가 없는 경우 빈 결과 반환
        where.clientId = { in: [] };
      }
    } else {
      // ADMIN, MANAGER, ENGINEER는 모든 고객사 조회 가능
      where.clientId = clientId;
    }
  } else if (!isAdminManagerEngineer) {
    // 고객사 사용자이고 clientId 필터가 없는 경우, 사용자가 속한 모든 고객사의 SR 조회
    if (userClientIds.length > 0) {
      where.clientId = { in: userClientIds };
    } else {
      // 고객사가 없는 경우 빈 결과 반환
      where.clientId = { in: [] };
    }
  }
  if (assigneeId && assigneeId !== 'all') {
    where.assigneeId = assigneeId === 'unassigned' ? null : assigneeId;
  }
  // Handle date filtering
  if (dateFrom || dateTo) {
    if (!where.createdAt) {
      where.createdAt = {};
    }
    if (dateFrom) {
      (where.createdAt as Prisma.DateTimeFilter<'SR'>).gte = new Date(dateFrom);
    }
    if (dateTo) {
      (where.createdAt as Prisma.DateTimeFilter<'SR'>).lte = new Date(dateTo);
    }
  }
  if (search) {
    where.OR = [
      { srNumber: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { client: { name: { contains: search, mode: 'insensitive' } } },
      { requester: { name: { contains: search, mode: 'insensitive' } } },
      { assignee: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // 관계형 필드 정렬 처리
  const getOrderBy = (): Prisma.SROrderByWithRelationInput | undefined => {
    const order = sortOrder === 'asc' ? 'asc' : 'desc';

    // 관계형 필드인 경우 중첩 객체 형식 사용
    if (sortField === 'client') {
      return { client: { name: order } };
    }
    if (sortField === 'requester') {
      return { requester: { name: order } };
    }
    if (sortField === 'assignee') {
      return { assignee: { name: order } };
    }

    // 일반 필드는 직접 정렬(위 allowlist 를 통과한 값만 도달한다)
    return { [sortField]: order } as Prisma.SROrderByWithRelationInput;
  };

  const orderBy = getOrderBy();

  // 1. 통계 집계용 격리 (Isolation) 기반 where 조건
  // 임시 필터(상태, 담당자, 검색어 등)에 의해 상단 대시보드 배지 통계가 왜곡되는 결함을 정정합니다.
  // 단, 멀티테넌트 데이터 격리(clientId 격리)는 철저히 유지합니다.
  const whereStats: Prisma.SRWhereInput = {};
  if (!isAdminManagerEngineer) {
    if (userClientIds.length > 0) {
      whereStats.clientId = { in: userClientIds };
    } else {
      whereStats.clientId = { in: [] };
    }
  }

  // 오늘 날짜 및 마감일 범위 계산
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Fetch all data in parallel
  const [
    srData,
    totalCount,
    waitingCount,
    inProgressCount,
    urgentCount,
    dueTodayCount,
    myAssignedCount,
    clients,
    users,
  ] = await Promise.all([
    srService.getAllSRs({
      where,
      orderBy,
      skip: (page - 1) * itemsPerPage,
      take: itemsPerPage,
    }),
    srService.countSRs({ where }), // 현재 활성화된 필터/검색 적용 결과 총 개수
    srService.countSRs({ where: { ...whereStats, status: 'REQUESTED' } }),
    srService.countSRs({ where: { ...whereStats, status: 'IN_PROGRESS' } }),
    srService.countSRs({ where: { ...whereStats, priority: { in: ['CRITICAL', 'HIGH'] } } }),
    srService.countSRs({
      where: {
        ...whereStats,
        dueDate: { gte: today, lt: tomorrow },
        status: { in: ['INTAKE', 'IN_PROGRESS', 'ON_HOLD'] },
      },
    }),
    srService.countSRs({
      where: {
        ...whereStats,
        assigneeId: session?.user?.id || 'non-existent',
      },
    }),
    clientsPromise,
    usersPromise,
  ]);

  const globalCounts = {
    waiting: waitingCount,
    inProgress: inProgressCount,
    urgent: urgentCount,
    dueToday: dueTodayCount,
    myAssigned: myAssignedCount,
  };

  const paginationInfo = {
    currentPage: page,
    itemsPerPage,
    totalCount,
    totalPages: Math.ceil(totalCount / itemsPerPage),
    hasPrevPage: page > 1,
    hasNextPage: page < Math.ceil(totalCount / itemsPerPage),
  };

  return (
    <SRsDataTable
      srs={srData}
      paginationInfo={paginationInfo}
      clients={clients}
      users={users}
      globalCounts={globalCounts}
    />
  );
}
