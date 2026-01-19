export function getSrsListTtlSeconds(): number {
  const v = Number(process.env.CACHE_TTL_SRS_LIST_SECONDS ?? 60);
  return Number.isFinite(v) && v > 0 ? v : 60;
}

export function getSrsDetailTtlSeconds(): number {
  const v = Number(process.env.CACHE_TTL_SRS_DETAIL_SECONDS ?? 60);
  return Number.isFinite(v) && v > 0 ? v : 60;
}

export function getDashboardTtlSeconds(): number {
  const v = Number(process.env.CACHE_TTL_DASHBOARD_SECONDS ?? 300);
  return Number.isFinite(v) && v > 0 ? v : 300;
}

export function shouldWideInvalidate(): boolean {
  return (process.env.CACHE_WIDE_INVALIDATION ?? '') === '1';
}
