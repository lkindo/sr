import { logger } from '@/lib/logger';

/**
 * 백그라운드 작업을 fire-and-forget 으로 실행하고 결과를 로그로 남긴다.
 *
 * 앱은 상시 구동 Node 서버(Docker)라 응답을 돌려준 뒤에도 프로세스가 살아 있어, 프로미스는 같은 프로세스에서
 * 끝까지 실행된다. 이 함수의 역할은 실패를 삼키지 않고 로그로 남기는 것이다.
 * 컨테이너가 재시작되면 진행 중인 작업은 유실되므로, 반드시 전달돼야 하는 알림은 아웃박스를 쓴다
 * (src/services/notification-outbox.ts).
 *
 * 예전에는 서버리스(Vercel) 전제로 `@vercel/functions` 의 `waitUntil` 에 프로미스를 등록했지만, 자체 서버에는
 * Vercel 요청 컨텍스트가 없어 아무 일도 하지 않는 호출이었다(2026-09-19 제거 — 동작 변화 없음).
 *
 * @param promise 백그라운드에서 실행할 Promise
 * @param label 로깅용 레이블 (선택)
 */
export function backgroundTask<T>(promise: Promise<T>, label?: string): void {
  void promise
    .then((result) => {
      logger.info(`[BackgroundTask] ${label || 'Task'} completed successfully`);
      return result;
    })
    .catch((error) => {
      logger.error(`[BackgroundTask] ${label || 'Task'} failed:`, error as Error);
    });
}

/**
 * 여러 백그라운드 작업을 동시에 실행합니다.
 */
export function backgroundTasks(tasks: Array<{ promise: Promise<unknown>; label?: string }>): void {
  tasks.forEach((task) => backgroundTask(task.promise, task.label));
}
