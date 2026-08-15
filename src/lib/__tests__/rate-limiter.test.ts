import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getClientIdentifier,
  MemoryRateLimiter,
  RateLimitPresets,
  resolveRateLimitKeys,
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

      const bucketsMap = (oomLimiter as any).buckets as Map<string, any>;
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

      const bucketsMap = (sampleLimiter as any).buckets as Map<string, any>;
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

describe('getClientIdentifier', () => {
  it('X-Forwarded-For에서 신뢰 프록시가 추가한 마지막(실제 클라이언트) IP를 사용해야 함', () => {
    // 클라이언트가 첫 항목(1.2.3.4)을 위조하더라도, nginx가 마지막에 실제 IP(5.6.7.8)를 추가한다.
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      },
    });

    const ip = getClientIdentifier(request);
    expect(ip).toBe('5.6.7.8');
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

  it('X-Real-IP(위조 불가)가 X-Forwarded-For보다 우선순위가 높아야 함', () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '1.2.3.4',
        'x-real-ip': '9.10.11.12',
      },
    });

    const ip = getClientIdentifier(request);
    expect(ip).toBe('9.10.11.12');
  });

  it('헤더가 없으면 기본값을 반환해야 함', () => {
    const request = new Request('http://localhost');

    const ip = getClientIdentifier(request);
    expect(ip).toBe('unknown');
  });
});

/**
 * 감사 D-1 회귀 방어.
 *
 * 세션 쿠키 값은 서명 검증 없이 버킷 키가 된다 — 즉 클라이언트가 키를 갈아 끼울 수 있다.
 * 이 스위트는 ① 읽지 않는 레거시 쿠키 이름이 키 재료가 되지 않고 ② 세션 키에는 반드시
 * IP 천장이 함께 붙는다는 두 가지를 고정한다. 둘 중 하나라도 풀리면 유효 계정 하나로
 * 전 제한을 무한 우회할 수 있다.
 */
describe('resolveRateLimitKeys — 쿠키 위조 방어', () => {
  const withCookie = (cookie: string, ip = '5.6.7.8') =>
    new Request('http://localhost', { headers: { cookie, 'x-real-ip': ip } });

  it('세션이 없으면 IP 로만 키잉하고 천장을 두지 않는다', () => {
    const keys = resolveRateLimitKeys(
      new Request('http://localhost', {
        headers: { 'x-real-ip': '5.6.7.8' },
      })
    );

    expect(keys.primary).toBe('5.6.7.8');
    // 주 버킷이 곧 IP 버킷이므로 중복 검사하지 않는다.
    expect(keys.ceiling).toBeNull();
  });

  it('Auth.js v5 세션 쿠키는 세션 키 + IP 천장을 함께 만든다', () => {
    const keys = resolveRateLimitKeys(withCookie('__Secure-authjs.session-token=real-token'));

    expect(keys.primary).toMatch(/^s:/);
    expect(keys.ceiling).not.toBeNull();
    expect(keys.ceiling!.key).toBe('ip:5.6.7.8');
    expect(keys.ceiling!.multiplier).toBeGreaterThan(1);
  });

  it('v5 가 읽지 않는 레거시 v4 쿠키 이름은 키 재료가 되지 않는다', () => {
    // 이것이 실제 익스플로잇이었다: v4 이름을 **앞에** 끼워 넣으면 파서가 그 난수를
    // 먼저 만나 키로 썼고, Auth.js v5 는 그 이름을 읽지 않으므로 인증은 그대로 성립했다.
    // 결과적으로 인증된 사용자가 요청마다 새 버킷을 얻었다.
    const forged = resolveRateLimitKeys(
      withCookie('next-auth.session-token=RANDOM-1; __Secure-authjs.session-token=real-token')
    );
    const clean = resolveRateLimitKeys(withCookie('__Secure-authjs.session-token=real-token'));

    // 위조 쿠키를 앞에 붙여도 키가 달라지지 않는다.
    expect(forged.primary).toBe(clean.primary);
  });

  it('레거시 쿠키만 있으면 세션으로 인정하지 않는다 (IP 키로 떨어진다)', () => {
    const keys = resolveRateLimitKeys(withCookie('next-auth.session-token=RANDOM-2'));

    expect(keys.primary).toBe('5.6.7.8');
    expect(keys.ceiling).toBeNull();
  });

  it('세션 값이 바뀌면 주 키는 달라지지만 IP 천장은 같다', () => {
    const a = resolveRateLimitKeys(withCookie('authjs.session-token=aaa'));
    const b = resolveRateLimitKeys(withCookie('authjs.session-token=bbb'));

    expect(a.primary).not.toBe(b.primary);
    // 키를 회전시켜도 이 천장이 같으므로 무한 우회가 되지 않는다.
    expect(a.ceiling!.key).toBe(b.ceiling!.key);
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
