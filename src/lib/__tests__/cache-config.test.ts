import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDashboardTtlSeconds,
  getSrsDetailTtlSeconds,
  getSrsListTtlSeconds,
  shouldWideInvalidate,
} from '../cache-config';

describe('cache-config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.CACHE_TTL_SRS_LIST_SECONDS;
    delete process.env.CACHE_TTL_SRS_DETAIL_SECONDS;
    delete process.env.CACHE_TTL_DASHBOARD_SECONDS;
    delete process.env.CACHE_WIDE_INVALIDATION;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('기본 TTL 값을 반환해야 한다', () => {
    expect(getSrsListTtlSeconds()).toBe(60);
    expect(getSrsDetailTtlSeconds()).toBe(60);
    expect(getDashboardTtlSeconds()).toBe(300);
    expect(shouldWideInvalidate()).toBe(false);
  });

  it('환경 변수를 통해 TTL을 오버라이드할 수 있다', () => {
    vi.stubEnv('CACHE_TTL_SRS_LIST_SECONDS', '180');
    vi.stubEnv('CACHE_TTL_SRS_DETAIL_SECONDS', '240');
    vi.stubEnv('CACHE_TTL_DASHBOARD_SECONDS', '900');
    vi.stubEnv('CACHE_WIDE_INVALIDATION', '1');

    expect(getSrsListTtlSeconds()).toBe(180);
    expect(getSrsDetailTtlSeconds()).toBe(240);
    expect(getDashboardTtlSeconds()).toBe(900);
    expect(shouldWideInvalidate()).toBe(true);
  });

  it('유효하지 않은 환경 변수는 기본값을 사용한다', () => {
    vi.stubEnv('CACHE_TTL_SRS_LIST_SECONDS', 'invalid');
    vi.stubEnv('CACHE_TTL_SRS_DETAIL_SECONDS', '-10');
    vi.stubEnv('CACHE_TTL_DASHBOARD_SECONDS', '0');
    vi.stubEnv('CACHE_WIDE_INVALIDATION', '0');

    expect(getSrsListTtlSeconds()).toBe(60);
    expect(getSrsDetailTtlSeconds()).toBe(60);
    expect(getDashboardTtlSeconds()).toBe(300);
    expect(shouldWideInvalidate()).toBe(false);
  });
});
