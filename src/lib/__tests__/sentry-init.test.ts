import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initSentry } from '@/lib/sentry-init';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn() }));

const { init } = await import('@sentry/nextjs');

/**
 * `Sentry.init` 에 실제로 넘어간 옵션. 호출되지 않았으면 실패한다.
 *
 * 선언 타입이 브라우저/노드/엣지 옵션의 **유니온**이라 개별 필드 접근이 막힌다
 * (replay 계열은 브라우저 쪽에만 있다). 여기서는 "무엇을 넘겼는지"만 확인하면
 * 되므로 느슨한 레코드로 본다.
 */
const initOptions = () => {
  expect(init).toHaveBeenCalledTimes(1);
  const [call] = vi.mocked(init).mock.calls;
  if (!call) throw new Error('Sentry.init 이 호출되지 않았다');

  return call[0] as Record<string, unknown> & {
    beforeSend?: (event: unknown, hint: unknown) => unknown;
  };
};

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // 이것이 이 모듈의 가장 중요한 계약이다. DSN 이 없는 환경(로컬, CI, 미설정 운영)에서
  // 초기화가 일어나면 존재하지 않는 엔드포인트로 이벤트를 쏘게 된다.
  it('DSN 이 없으면 초기화하지 않는다', () => {
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');

    initSentry('server');

    expect(init).not.toHaveBeenCalled();
  });

  // "설정한 줄 알았는데 .env.example 값 그대로였다" 가 가장 흔한 실패다.
  it.each(['https://your-dsn-here@sentry.io/1', 'https://example@example.com/0', 'CHANGEME'])(
    '플레이스홀더 값(%s)은 미설정으로 본다',
    (dsn) => {
      vi.stubEnv('SENTRY_DSN', dsn);

      initSentry('server');

      expect(init).not.toHaveBeenCalled();
    }
  );

  it('DSN 이 있으면 초기화한다', () => {
    vi.stubEnv('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/42');

    initSentry('server');

    expect(initOptions().dsn).toBe('https://abc123@o1.ingest.sentry.io/42');
  });

  // 브라우저 번들에는 NEXT_PUBLIC_ 접두사가 붙은 값만 들어간다. 서버 전용 DSN 을
  // 클라이언트에서 읽으면 번들 시점에 undefined 라 조용히 꺼진다.
  it('클라이언트는 서버 전용 DSN 으로는 켜지지 않는다', () => {
    vi.stubEnv('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/42');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');

    initSentry('client');

    expect(init).not.toHaveBeenCalled();
  });

  // SR 본문과 고객사 정보가 외부로 나가면 안 된다. 이 세 스위치가 그 방어선이다.
  it('PII 를 보내지 않도록 설정한다', () => {
    vi.stubEnv('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/42');

    initSentry('server');

    const options = initOptions();
    expect(options.sendDefaultPii).toBe(false);
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
  });

  // sendDefaultPii:false 만 믿지 않는다. 통합(integration)이 직접 채워 넣는 경로가 있어
  // beforeSend 에서 한 번 더 턴다.
  it('beforeSend 가 쿠키·헤더·본문을 제거한다', () => {
    vi.stubEnv('SENTRY_DSN', 'https://abc123@o1.ingest.sentry.io/42');

    initSentry('server');

    const event = {
      request: {
        url: 'https://sr.example.com/srs/1',
        cookies: { 'authjs.session-token': 'secret' },
        headers: { cookie: 'authjs.session-token=secret' },
        data: { content: 'SR 본문' },
      },
    };
    const scrubbed = initOptions().beforeSend?.(event, {}) as typeof event;

    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.headers).toBeUndefined();
    expect(scrubbed.request.data).toBeUndefined();
    // URL 은 남긴다 — 어느 경로에서 터졌는지 모르면 추적할 수 없다.
    expect(scrubbed.request.url).toBe('https://sr.example.com/srs/1');
  });
});
