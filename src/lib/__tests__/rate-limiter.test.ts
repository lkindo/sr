import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryRateLimiter, RateLimitPresets, getClientIdentifier } from '../rate-limiter';

describe('MemoryRateLimiter', () => {
  let rateLimiter: MemoryRateLimiter;

  beforeEach(() => {
    rateLimiter = new MemoryRateLimiter({
      windowMs: 1000, // 1초
      maxRequests: 3,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('check', () => {
    it('첫 요청은 허용되어야 함', async () => {
      const result = await rateLimiter.check('test-key');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(2);
      expect(result.limit).toBe(3);
    });

    it('최대 요청 수까지는 허용되어야 함', async () => {
      // 첫 번째 요청
      const result1 = await rateLimiter.check('test-key');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      // 두 번째 요청
      const result2 = await rateLimiter.check('test-key');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      // 세 번째 요청
      const result3 = await rateLimiter.check('test-key');
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('최대 요청 수 초과 시 거부되어야 함', async () => {
      // 3회 요청 (한도)
      await rateLimiter.check('test-key');
      await rateLimiter.check('test-key');
      await rateLimiter.check('test-key');

      // 4번째 요청 (초과)
      const result = await rateLimiter.check('test-key');

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(3);
      expect(result.remaining).toBe(0);
      expect(result.resetTime).toBeGreaterThan(0);
    });

    it('다른 키는 독립적으로 제한되어야 함', async () => {
      // key1 3회 요청
      await rateLimiter.check('key1');
      await rateLimiter.check('key1');
      await rateLimiter.check('key1');

      // key1은 초과
      const result1 = await rateLimiter.check('key1');
      expect(result1.allowed).toBe(false);

      // key2는 여전히 허용
      const result2 = await rateLimiter.check('key2');
      expect(result2.allowed).toBe(true);
    });

    it('윈도우가 만료되면 리셋되어야 함', async () => {
      vi.useFakeTimers();

      // 3회 요청 (한도)
      await rateLimiter.check('test-key');
      await rateLimiter.check('test-key');
      await rateLimiter.check('test-key');

      // 4번째 요청 거부
      const result1 = await rateLimiter.check('test-key');
      expect(result1.allowed).toBe(false);

      // 1초 경과 (윈도우 만료)
      vi.advanceTimersByTime(1001);

      // 새로운 윈도우에서 다시 허용
      const result2 = await rateLimiter.check('test-key');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(2);

      vi.useRealTimers();
    });
  });

  describe('reset', () => {
    it('특정 키의 rate limit을 리셋해야 함', async () => {
      // 3회 요청 (한도)
      await rateLimiter.check('test-key');
      await rateLimiter.check('test-key');
      await rateLimiter.check('test-key');

      // 리셋
      await rateLimiter.reset('test-key');

      // 다시 허용
      const result = await rateLimiter.check('test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });
  });

  describe('resetAll', () => {
    it('모든 rate limit을 리셋해야 함', async () => {
      // 여러 키에 대해 요청
      await rateLimiter.check('key1');
      await rateLimiter.check('key1');
      await rateLimiter.check('key1');

      await rateLimiter.check('key2');
      await rateLimiter.check('key2');
      await rateLimiter.check('key2');

      // 모두 리셋
      await rateLimiter.resetAll();

      // 모두 다시 허용
      const result1 = await rateLimiter.check('key1');
      const result2 = await rateLimiter.check('key2');

      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(2);
    });
  });
});

describe('RateLimitPresets', () => {
  it('STRICT 프리셋은 엄격한 제한을 가져야 함', () => {
    expect(RateLimitPresets.STRICT.windowMs).toBe(60 * 1000);
    expect(RateLimitPresets.STRICT.maxRequests).toBeLessThanOrEqual(10); // 기본값 5
  });

  it('STANDARD 프리셋은 일반 제한을 가져야 함', () => {
    expect(RateLimitPresets.STANDARD.windowMs).toBe(60 * 1000);
    expect(RateLimitPresets.STANDARD.maxRequests).toBeGreaterThanOrEqual(50);
  });

  it('RELAXED 프리셋은 느슨한 제한을 가져야 함', () => {
    expect(RateLimitPresets.RELAXED.windowMs).toBe(60 * 1000);
    expect(RateLimitPresets.RELAXED.maxRequests).toBeGreaterThanOrEqual(100);
  });

  it('FILE_UPLOAD 프리셋은 긴 윈도우를 가져야 함', () => {
    expect(RateLimitPresets.FILE_UPLOAD.windowMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});

describe('getClientIdentifier', () => {
  it('X-Forwarded-For 헤더에서 IP를 추출해야 함', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      },
    });

    const ip = getClientIdentifier(request);
    expect(ip).toBe('1.2.3.4');
  });

  it('X-Real-IP 헤더에서 IP를 추출해야 함', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-real-ip': '9.10.11.12',
      },
    });

    const ip = getClientIdentifier(request);
    expect(ip).toBe('9.10.11.12');
  });

  it('X-Forwarded-For가 우선순위가 높아야 함', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '9.10.11.12',
      },
    });

    const ip = getClientIdentifier(request);
    expect(ip).toBe('1.2.3.4');
  });

  it('헤더가 없으면 기본값을 반환해야 함', () => {
    const request = new Request('http://localhost');

    const ip = getClientIdentifier(request);
    expect(ip).toBe('unknown');
  });
});
