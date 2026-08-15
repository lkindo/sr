// @vitest-environment node
//
// 이 파일만 node 환경으로 돌린다. `unit` 프로젝트 기본값인 jsdom 에서는 `window` 가
// 존재해 Logger 가 스스로를 브라우저로 판단하고 pino 초기화를 통째로 건너뛴다
// (= 종료 훅도 등록되지 않아 테스트가 의미를 잃는다).
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 감사 3.30 회귀 테스트.
 *
 * pino destination 이 `{ sync: false, minLength: 4096 }` 이라 최대 4KB 가 버퍼에 머문다.
 * 종료 훅이 없으면 배포 SIGTERM 이나 크래시 직전의 로그 — 사후 분석에 가장 필요한 출력 —
 * 이 그대로 사라진다.
 *
 * pino 는 로거 모듈 안에서 `require('pino')` 로 로드되어 `vi.mock` 이 가로채지 못한다.
 * 그래서 같은 CJS 인스턴스를 잡아 `destination` 을 감싸는 방식으로 관찰한다.
 */

const nodeRequire = createRequire(import.meta.url);
const pinoModule = nodeRequire('pino');
const realDestination = pinoModule.destination;

type Handler = (...args: unknown[]) => void;

let handlers: Map<string, Handler[]>;
let flushSyncSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
let processOnSpy: ReturnType<typeof vi.spyOn>;
let processExitSpy: ReturnType<typeof vi.spyOn>;

const GUARD_KEY = '__srLoggerFlushHandlersRegistered';

/** 프로덕션 모드로 로거 모듈을 새로 평가한다. */
async function loadLoggerAsProduction() {
  vi.resetModules();
  delete (globalThis as Record<string, unknown>)[GUARD_KEY];
  vi.stubEnv('NODE_ENV', 'production');
  return import('../logger');
}

beforeEach(() => {
  handlers = new Map();
  flushSyncSpy = vi.fn<(...args: unknown[]) => void>();

  // 실제 destination 을 만들되 flushSync 만 관찰 가능하게 감싼다.
  pinoModule.destination = (options: unknown) => {
    const destination = realDestination(options);
    const original = destination.flushSync.bind(destination);
    destination.flushSync = (...args: unknown[]) => {
      flushSyncSpy(...args);
      return original(...args);
    };
    return destination;
  };

  processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, fn: Handler) => {
    const list = handlers.get(event) ?? [];
    list.push(fn);
    handlers.set(event, list);
    return process;
  }) as never);

  processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

afterEach(() => {
  pinoModule.destination = realDestination;
  processOnSpy.mockRestore();
  processExitSpy.mockRestore();
  vi.unstubAllEnvs();
  delete (globalThis as Record<string, unknown>)[GUARD_KEY];
});

const fire = (event: string, ...args: unknown[]) => {
  const list = handlers.get(event);
  expect(list, `${event} 핸들러가 등록되어 있어야 한다`).toBeDefined();
  list![0]!(...args);
};

describe('logger — 종료 시 로그 플러시', () => {
  it('비동기 destination 을 쓰면 종료 훅을 등록한다', async () => {
    await loadLoggerAsProduction();

    for (const event of [
      'beforeExit',
      'SIGTERM',
      'SIGINT',
      'uncaughtException',
      'unhandledRejection',
    ]) {
      expect(handlers.has(event), `${event} 핸들러가 등록되어야 한다`).toBe(true);
    }
  });

  /**
   * **2026-08-15 변경**: 로거는 플러시만 하고 **프로세스를 내리지 않는다**(감사 D-9).
   *
   * 예전에는 여기서 `process.exit(0)` 를 동기 호출했다. 그러면 Next.js standalone
   * 서버의 비동기 정리를 기다리지 않고 소켓이 끊겨, CSV 스트리밍은 잘린 파일이
   * 정상 다운로드처럼 저장되고 업로드는 고아 파일을 남겼다.
   * 종료 오케스트레이션은 `src/instrumentation.ts` 가 유예 시간을 두고 수행한다.
   */
  it('SIGTERM 에서 버퍼를 동기 플러시하되 프로세스를 내리지는 않는다', async () => {
    await loadLoggerAsProduction();

    fire('SIGTERM');

    expect(flushSyncSpy).toHaveBeenCalled();
    // 로거가 exit 를 부르면 진행 중인 응답이 잘린다 — 그 책임은 로거에 없다.
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('SIGINT 에서도 플러시한다', async () => {
    await loadLoggerAsProduction();

    fire('SIGINT');

    expect(flushSyncSpy).toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('beforeExit 에서도 플러시한다 (정상 종료 경로)', async () => {
    await loadLoggerAsProduction();

    fire('beforeExit');

    expect(flushSyncSpy).toHaveBeenCalled();
  });

  it('uncaughtException 은 플러시하고 1로 종료한다', async () => {
    await loadLoggerAsProduction();

    fire('uncaughtException', new Error('boom'));

    expect(flushSyncSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('unhandledRejection 도 같은 경로를 탄다', async () => {
    await loadLoggerAsProduction();

    fire('unhandledRejection', 'reason');

    expect(flushSyncSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('flushSync 가 던져도 신호 처리를 막지 않는다', async () => {
    await loadLoggerAsProduction();
    flushSyncSpy.mockImplementationOnce(() => {
      throw new Error('destination closed');
    });

    // 플러시 실패가 종료 경로 전체를 무너뜨리면 안 된다.
    expect(() => fire('SIGTERM')).not.toThrow();
  });

  it('모듈이 다시 평가돼도 핸들러를 중복 등록하지 않는다', async () => {
    await loadLoggerAsProduction();
    const firstCount = handlers.get('SIGTERM')!.length;

    // 전역 가드를 지우지 않고 다시 로드 (HMR / 모듈 재평가 상황)
    vi.resetModules();
    await import('../logger');

    expect(handlers.get('SIGTERM')!.length).toBe(firstCount);
  });

  it('개발 모드에서는 pino 자체를 초기화하지 않아 훅도 없다', async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>)[GUARD_KEY];
    vi.stubEnv('NODE_ENV', 'development');
    await import('../logger');

    expect(handlers.has('SIGTERM')).toBe(false);
  });
});
