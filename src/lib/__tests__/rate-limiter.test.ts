import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getClientIp,
  ipRateLimitKeys,
  MemoryRateLimiter,
  RateLimitPresets,
  userRateLimitKeys,
} from '../rate-limiter';

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

  describe('OOM 방어 및 점진적 축출', () => {
    // 이 테스트는 원래 "삽입 순서로 앞 500개를 지운다"를 사양으로 못 박고 있었다
    // (key-0·key-499 는 없고 key-500 은 있어야 한다). 그 정책이 바로 감사 4.1 이 지적한
    // 우회 경로다 — 축출은 곧 토큰 리셋이므로, 키를 대량 생성할 수 있는 쪽은 자기
    // 소진 버킷을 밀어내는 것만으로 제한을 무한히 풀 수 있었다.
    // 이제 "무엇을 먼저 버리는가"가 아니라 "제한이 유지되는가"를 단언한다.
    it('임계치 초과 시 제한과 무관한 버킷부터 방출해 크기를 줄여야 함', async () => {
      const oomLimiter = new MemoryRateLimiter({
        windowMs: 10000,
        maxRequests: 5,
      });

      const bucketsMap = (oomLimiter as unknown as Record<string, unknown>).buckets as Map<
        string,
        any
      >;
      for (let i = 0; i < 10005; i++) {
        bucketsMap.set(`key-${i}`, {
          tokens: 5,
          lastRefill: Date.now(),
        });
      }
      // 소진된(제한에 걸린) 버킷 하나를 섞어 둔다.
      bucketsMap.set('throttled', { tokens: 0, lastRefill: Date.now() });

      expect(bucketsMap.size).toBe(10006);

      await oomLimiter.check('new-key');

      expect(bucketsMap.size).toBeLessThanOrEqual(9506);
      // 여유 토큰이 있는 버킷이 넘치도록 남아 있으므로 소진 버킷은 버릴 이유가 없다.
      expect(bucketsMap.has('throttled')).toBe(true);
      expect(bucketsMap.get('throttled').tokens).toBe(0);
    });

    it('랜덤 샘플링을 통해 만료된 데이터를 O(1) 수준으로 지워야 함', async () => {
      const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.05);

      const sampleLimiter = new MemoryRateLimiter({
        windowMs: 1000,
        maxRequests: 5,
      });

      const bucketsMap = (sampleLimiter as unknown as Record<string, unknown>).buckets as Map<
        string,
        unknown
      >;
      const expiredTime = Date.now() - 2000;
      for (let i = 0; i < 10; i++) {
        bucketsMap.set(`expired-${i}`, {
          tokens: 5,
          lastRefill: expiredTime,
        });
      }

      expect(bucketsMap.size).toBe(10);

      await sampleLimiter.check('active-key');

      expect(bucketsMap.size).toBeLessThan(11);

      randSpy.mockRestore();
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

describe('getClientIp', () => {
  it('X-Forwarded-For에서 신뢰 프록시가 추가한 마지막(실제 클라이언트) IP를 사용해야 함', () => {
    // 클라이언트가 첫 항목(1.2.3.4)을 위조하더라도, nginx가 마지막에 실제 IP(5.6.7.8)를 추가한다.
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      },
    });

    const ip = getClientIp(request.headers);
    expect(ip).toBe('5.6.7.8');
  });

  it('X-Real-IP 헤더에서 IP를 추출해야 함', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-real-ip': '9.10.11.12',
      },
    });

    const ip = getClientIp(request.headers);
    expect(ip).toBe('9.10.11.12');
  });

  it('X-Real-IP(위조 불가)가 X-Forwarded-For보다 우선순위가 높아야 함', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '9.10.11.12',
      },
    });

    const ip = getClientIp(request.headers);
    expect(ip).toBe('9.10.11.12');
  });

  it('헤더가 없으면 기본값을 반환해야 함', () => {
    const request = new Request('http://localhost');

    const ip = getClientIp(request.headers);
    expect(ip).toBe('unknown');
  });
});

describe('ipRateLimitKeys', () => {
  const withCookie = (cookie: string) => new Headers({ cookie, 'x-real-ip': '5.6.7.8' });

  // 익명도 가짜 쿠키를 바꿔 가며 새 버킷을 얻던 경로다.
  it('세션 쿠키가 달라도 같은 IP 면 같은 키다', () => {
    const a = ipRateLimitKeys(withCookie('__Secure-authjs.session-token=aaa'));
    const b = ipRateLimitKeys(withCookie('__Secure-authjs.session-token=bbb'));

    expect(a).toEqual({ primary: '5.6.7.8', ceiling: null });
    expect(b).toEqual(a);
  });
});

describe('userRateLimitKeys', () => {
  const request = (path: string, method = 'POST', ip = '5.6.7.8') => ({
    method,
    url: `https://sr.example.com${path}`,
    headers: new Headers({ 'x-real-ip': ip }),
  });

  it('사용자, 메서드, 라우트로 주 버킷을 잡고 IP 천장을 함께 건다', () => {
    const keys = userRateLimitKeys(request('/api/srs/sr-1/comments'), { id: 'sr-1' }, 'user-1');

    expect(keys.primary).toBe('u:user-1:POST:/api/srs/:id/comments');
    expect(keys.ceiling?.key).toBe('ip:5.6.7.8');
    expect(keys.ceiling?.multiplier).toBeGreaterThan(1);
  });

  it('ID 를 바꿔도 같은 버킷이다', () => {
    const a = userRateLimitKeys(request('/api/srs/sr-1/comments'), { id: 'sr-1' }, 'user-1');
    const b = userRateLimitKeys(request('/api/srs/sr-2/comments'), { id: 'sr-2' }, 'user-1');

    expect(a.primary).toBe(b.primary);
  });

  it('파라미터가 여럿이거나 인코딩돼 있어도 템플릿으로 바꾼다', () => {
    const nested = userRateLimitKeys(
      request('/api/clients/c-1/categories/cat%201', 'PATCH'),
      { id: 'c-1', categoryId: 'cat 1' },
      'user-1'
    );

    expect(nested.primary).toBe('u:user-1:PATCH:/api/clients/:id/categories/:categoryId');
  });

  it('잘못된 인코딩이 있어도 던지지 않는다', () => {
    expect(() =>
      userRateLimitKeys(request('/api/srs/%E0%A4%A/comments'), { id: 'sr-1' }, 'user-1')
    ).not.toThrow();
  });

  it('사용자, 메서드, 라우트가 다르면 버킷이 나뉜다', () => {
    const base = userRateLimitKeys(request('/api/srs/sr-1/comments'), { id: 'sr-1' }, 'user-1');
    const others = [
      userRateLimitKeys(request('/api/srs/sr-1/comments'), { id: 'sr-1' }, 'user-2'),
      userRateLimitKeys(request('/api/srs/sr-1/comments', 'GET'), { id: 'sr-1' }, 'user-1'),
      userRateLimitKeys(request('/api/srs/sr-1/intake'), { id: 'sr-1' }, 'user-1'),
    ];

    for (const other of others) expect(other.primary).not.toBe(base.primary);
  });

  it('HEAD 는 GET 과 예산을 함께 쓴다', () => {
    const get = userRateLimitKeys(request('/api/reports/export', 'GET'), {}, 'user-1');
    const head = userRateLimitKeys(request('/api/reports/export', 'HEAD'), {}, 'user-1');

    expect(head.primary).toBe(get.primary);
  });

  it('다른 사용자여도 같은 IP 면 천장을 함께 쓴다', () => {
    const a = userRateLimitKeys(request('/api/a'), {}, 'user-1');
    const b = userRateLimitKeys(request('/api/b'), {}, 'user-2');

    expect(a.ceiling?.key).toBe(b.ceiling?.key);
  });
});

describe('MemoryRateLimiter — 배수 한도', () => {
  it('배수를 주면 한도가 그만큼 커진다', async () => {
    const limiter = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 2 });

    const first = await limiter.check('ip:1.1.1.1', 3);
    expect(first.limit).toBe(6);

    // 2회가 아니라 6회까지 허용된다.
    for (let i = 0; i < 5; i++) await limiter.check('ip:1.1.1.1', 3);
    const overflow = await limiter.check('ip:1.1.1.1', 3);
    expect(overflow.allowed).toBe(false);
  });

  it('배수가 1 미만이어도 한도를 0 으로 만들지 않는다', async () => {
    // 잘못된 환경변수가 모든 요청을 거부하는 장애를 만들지 않아야 한다.
    const limiter = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 5 });

    const result = await limiter.check('ip:2.2.2.2', 0);
    expect(result.limit).toBe(5);
    expect(result.allowed).toBe(true);
  });
});
