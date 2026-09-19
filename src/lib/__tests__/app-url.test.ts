import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAppUrl, getSRUrl } from '@/lib/app-url';

describe('app-url', () => {
  const originalEnv = process.env;

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  describe('getAppUrl', () => {
    it('should return process.env.NEXT_PUBLIC_APP_URL if set', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://custom-domain.com';
      expect(getAppUrl()).toBe('https://custom-domain.com');
    });

    it('should strip quotes from NEXT_PUBLIC_APP_URL', () => {
      process.env.NEXT_PUBLIC_APP_URL = '"https://custom-domain.com"';
      expect(getAppUrl()).toBe('https://custom-domain.com');
    });

    it('운영 빌드(NODE_ENV=production)의 서버에서는 NEXT_PUBLIC_APP_URL 이 없으면 운영 도메인을 쓴다', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      vi.stubEnv('NODE_ENV', 'production');
      expect(getAppUrl()).toBe('https://www.lkindo.kr');
    });

    it('VERCEL 환경변수는 더 이상 보지 않는다 — 운영 빌드가 아니면 로컬 기본값이다', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('VERCEL', '1');
      expect(getAppUrl()).toBe('http://localhost:3000');
    });

    it('should return local default when no env vars are set', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      vi.stubEnv('NODE_ENV', 'development');
      expect(getAppUrl()).toBe('http://localhost:3000');
    });
  });

  describe('getSRUrl', () => {
    it('should append /srs/:id to app url', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://test.com';
      expect(getSRUrl('sr-123')).toBe('https://test.com/srs/sr-123');
    });
  });
});
