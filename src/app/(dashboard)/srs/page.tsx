import { Prisma } from '@prisma/client';

import { auth } from '@/auth';
import { SRsDataTable } from '@/components/srs/SRsDataTable';
import { getCachedClients, getCachedUsers } from '@/lib/cache';
import { srService } from '@/services/sr.service';

type Props = {
  params: Promise<Record<string, unknown>>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Helper to parse search params
const getSearchParam = (param: string | string[] | undefined): string | undefined => {
  return Array.isArray(param) ? param[0] : param;
};

export default async function SRsPage({ searchParams }: Props) {
  const resolvedSearchParams = (await searchParams) || {};

  // Start fetching cached data early (parallel execution)
  const clientsPromise = getCachedClients();
  const usersPromise = getCachedUsers();

  const page = parseInt(getSearchParam(resolvedSearchParams.page) ?? '1', 10);
  const itemsPerPage = parseInt(getSearchParam(resolvedSearchParams.itemsPerPage) ?? '20', 10);
  const sort = getSearchParam(resolvedSearchParams.sort) ?? 'createdAt.desc';
  const [sortField, sortOrder] = sort.split('.');

  const status = getSearchParam(resolvedSearchParams.status);
  const priority = getSearchParam(resolvedSearchParams.priority);
  const clientId = getSearchParam(resolvedSearchParams.clientId);
  const assigneeId = getSearchParam(resolvedSearchParams.assigneeId);
  const search = getSearchParam(resolvedSearchParams.search);
  const dateFrom = getSearchParam(resolvedSearchParams.dateFrom);
  const dateTo = getSearchParam(resolvedSearchParams.dateTo);

  // 세션 정보 가져오기
  const session = await auth();
  const userRoles = session?.user?.roles || [];

  // ADMIN, MANAGER, ENGINEER가 아닌 경우 고객사 필터링
  const isAdminManagerEngineer = userRoles.some((role) =>
    ['ADMIN', 'MANAGER', 'ENGINEER'].includes(role)
  );

  const where: Prisma.SRWhereInput = {};

  // 고객사 사용자인 경우 해당 고객사의 SR만 조회
  // Optimized: Use clientIds from session instead of DB query
  const userClientIds: string[] = session?.user?.clientIds || [];

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

    // 일반 필드는 직접 정렬
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
