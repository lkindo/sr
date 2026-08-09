import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryRateLimiter } from '../rate-limiter';

/**
 * 감사 4.1 회귀 테스트 — OOM 가드가 살아 있는 버킷을 축출해 제한을 우회시키던 문제.
 *
 * `performIncrementalEviction` 의 2단계는 맵 크기가 10,000 을 넘으면 **만료 여부를 보지 않고**
 * 삽입 순서 기준 500개를 지웠다. 소진된 버킷이 지워지면 다음 요청에서 새 버킷이 만들어지고
 * 토큰이 전부 복구된다 — 즉 키를 대량으로 만들 수 있는 쪽은 자기 버킷을 밀어내는 것만으로
 * strict 제한(1분 5회)을 무한히 우회할 수 있었다.
 *
 * 이 테스트는 "제한에 걸린 키가 축출 이후에도 계속 막혀 있는가"만 본다. 축출 정책의
 * 세부(무엇을 먼저 버리는가)는 구현 자유로 남긴다.
 */

const CAPACITY_TRIGGER = 10_001;

describe('MemoryRateLimiter — 용량 초과 축출', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('제한에 걸린 키는 대량 축출이 일어나도 계속 막혀 있다', async () => {
    const limiter = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 5 });

    // 공격자의 키를 먼저 소진시킨다.
    for (let i = 0; i < 5; i++) {
      expect((await limiter.check('attacker')).allowed).toBe(true);
    }
    expect((await limiter.check('attacker')).allowed).toBe(false);

    // 용량 가드를 넘기도록 키를 대량 생성한다(예전에는 이 과정에서 'attacker' 가 축출됐다).
    for (let i = 0; i < CAPACITY_TRIGGER; i++) {
      await limiter.check(`filler-${i}`);
    }

    const after = await limiter.check('attacker');
    expect(after.allowed, '축출로 버킷이 리셋되어 제한이 우회됐다').toBe(false);
  });

  it('만료된 버킷은 회수되어 메모리가 무한히 늘지 않는다', async () => {
    // 윈도우가 매우 짧으면 채워 넣는 동안 앞쪽 버킷이 이미 만료된다.
    const limiter = new MemoryRateLimiter({ windowMs: 1, maxRequests: 5 });

    for (let i = 0; i < CAPACITY_TRIGGER + 2_000; i++) {
      await limiter.check(`ephemeral-${i}`);
    }

    // 만료 회수가 동작하면 맵은 상한 근처에서 머문다.
    expect(limiter.size).toBeLessThanOrEqual(CAPACITY_TRIGGER + 2_000);
  });

  it('윈도우가 지나면 정상적으로 다시 허용한다(축출과 무관하게)', async () => {
    // 예전에는 windowMs 20ms 에 실제로 30ms 를 자며 확인했다. 전체 스위트를 병렬로
    // 돌리면 세 번째 check 가 20ms 창을 넘겨 도착해 `false` 여야 할 것이 `true` 가
    // 되면서 간헐 실패했다. 리미터는 Date.now() 만 읽으므로 가짜 타이머로 시간을
    // 직접 밀면 부하와 무관하게 결정적으로 검증된다.
    vi.useFakeTimers();
    const limiter = new MemoryRateLimiter({ windowMs: 20, maxRequests: 2 });

    expect((await limiter.check('normal')).allowed).toBe(true);
    expect((await limiter.check('normal')).allowed).toBe(true);
    expect((await limiter.check('normal')).allowed).toBe(false);

    vi.advanceTimersByTime(30);

    expect((await limiter.check('normal')).allowed).toBe(true);
  });
});
