/* eslint-disable no-console */

/**
 * Instrumentation Hook
 *
 * Next.js 애플리케이션 시작 시 한 번 실행되는 훅입니다.
 * 환경 변수 검증, 글로벌 설정 등을 수행합니다.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // 서버 사이드에서만 실행
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 서버 시작 시 이벤트 리스너(service-registry) 즉시 로드 적용
    await import('@/services/service-registry');

    // 알림 아웃박스 디스패처. 적재만 하고 아무도 집어가지 않으면 알림은 영원히
    // PENDING 으로 남으므로, 적재 경로와 반드시 함께 살아 있어야 한다.
    const { startNotificationDispatcher, stopNotificationDispatcher } =
      await import('@/services/notification-outbox');
    startNotificationDispatcher();

    registerGracefulShutdown(stopNotificationDispatcher);

    // E2E 테스트 등에서만 검증 스킵을 허용한다. 프로덕션에서는 스킵 플래그를 무시하고
    // 항상 환경 변수 검증을 수행한다(실수로 켜진 플래그로 fast-fail이 비활성화되는 것 방지).
    const isProduction = process.env.NODE_ENV === 'production';
    if (
      !isProduction &&
      (process.env.SKIP_ENV_VALIDATION === 'true' || process.env.PLAYWRIGHT_TEST === 'true')
    ) {
      console.log('✅ Instrumentation registered (env validation skipped for testing)');
      return;
    }

    // 환경 변수 검증 활성화
    const { validateAndPrintEnv } = await import('./lib/env-validation');
    validateAndPrintEnv();
  }
}

/**
 * 종료 신호를 받으면 **유예 시간을 두고** 프로세스를 내린다.
 *
 * 예전에는 로거가 SIGTERM 에서 `process.exit(0)` 를 동기 호출했다(감사 D-9).
 * 그러면 진행 중인 응답이 즉시 잘린다 — CSV 스트리밍은 잘린 파일이 정상 다운로드처럼
 * 저장되고, 업로드는 DB 행 없는 고아 파일을 남기며, 아웃박스 배치는 임대가 만료될
 * 때까지 알림을 지연시킨다.
 *
 * 유예 동안 새 작업은 받지 않되 진행 중인 것은 끝낼 기회를 준다.
 * `docker-compose.prod.yml` 의 `stop_grace_period` 를 이 값보다 길게 잡아야
 * 도커가 먼저 SIGKILL 을 보내지 않는다.
 */
function registerGracefulShutdown(...cleanups: Array<() => void>) {
  const graceMs = Number(process.env.SHUTDOWN_GRACE_MS ?? 15_000);
  let shuttingDown = false;

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      // 두 번째 신호는 무시한다 — 재진입하면 유예가 초기화되거나 정리가 중복된다.
      if (shuttingDown) return;
      shuttingDown = true;

      console.log(`[shutdown] ${signal} 수신 — ${graceMs}ms 유예 후 종료합니다.`);
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // 정리 실패가 종료 자체를 막지 않는다.
        }
      }

      const timer = setTimeout(() => {
        console.log('[shutdown] 유예 종료 — 프로세스를 내립니다.');
        process.exit(0);
      }, graceMs);
      // 진행 중인 작업이 모두 끝나 이벤트 루프가 비면 이 타이머 때문에 살아 있지 않게 한다.
      timer.unref?.();
    });
  }
}
