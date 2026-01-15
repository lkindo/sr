import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAppUrl, getSRUrl } from '@/lib/app-url';

describe('app-url', () => {
    const originalEnv = process.env;

    afterEach(() => {
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

        it('should return production default if VERCEL_URL is set (and no NEXT_PUBLIC_APP_URL)', () => {
            delete process.env.NEXT_PUBLIC_APP_URL;
            process.env.VERCEL = '1';
            expect(getAppUrl()).toBe('https://www.lkindo.kr');
        });

        it('should return local default when no env vars are set', () => {
            delete process.env.NEXT_PUBLIC_APP_URL;
            delete process.env.VERCEL;
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
