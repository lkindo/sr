// Centralized cache key helpers and prefixes
export const CACHE_NS = 'sr';

export const SR_LIST_PREFIX = 'sr:list:';
export const SR_DETAIL_PREFIX = 'sr:detail:';
export const DASHBOARD_STATS_PREFIX = 'dashboard:stats:';
export const MY_REQUESTS_PREFIX = 'srs:my-requests:';

export function srListKey(filters: {
  status?: string | null;
  clientId?: string | null;
  priority?: string | null;
}) {
  const status = filters.status ?? 'any';
  const clientId = filters.clientId ?? 'any';
  const priority = filters.priority ?? 'any';
  return `${SR_LIST_PREFIX}${status}:${clientId}:${priority}`;
}

// Pattern helpers for targeted invalidation
export function srListPatternForClient(clientId: string) {
  return `${SR_LIST_PREFIX}*:${clientId}:*`;
}
export function srListPatternForStatus(status: string) {
  return `${SR_LIST_PREFIX}${status}:*:*`;
}
export function srListPatternForPriority(priority: string) {
  return `${SR_LIST_PREFIX}*:*:${priority}`;
}
export function srListPatternAll() {
  return `${SR_LIST_PREFIX}*`;
}
export function myRequestsPatternAll() {
  return `${MY_REQUESTS_PREFIX}*`;
}
export function dashboardStatsPatternAll() {
  return `${DASHBOARD_STATS_PREFIX}*`;
}

export function srDetailKey(id: string) {
  return `${SR_DETAIL_PREFIX}${id}`;
}

export function dashboardStatsKey(
  scope: { userId?: string; roleScope?: 'admin' | 'client' | 'engineer' | 'generic' } = {}
) {
  const userId = scope.userId ?? 'global';
  const role = scope.roleScope ?? 'generic';
  return `${DASHBOARD_STATS_PREFIX}${userId}:${role}`;
}

export function myRequestsKey(
  userId: string,
  status: string | null | undefined,
  sortBy: string | null | undefined
) {
  return `${MY_REQUESTS_PREFIX}${userId}:${status ?? 'all'}:${sortBy ?? 'createdAt'}`;
}
