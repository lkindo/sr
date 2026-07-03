import { waitUntil } from '@vercel/functions';

import { logger } from '@/lib/logger';

/**
 * 백그라운드 작업을 "요청 수명에 연결"하여 실행합니다.
 *
 * 서버리스(예: Vercel) 환경에서는 응답을 반환한 뒤 함수가 즉시 동결/종료될 수 있어,
 * fire-and-forget 프로미스(이메일/푸시 알림 등)가 완료되기 전에 유실될 수 있습니다.
 * 이를 방지하기 위해 `@vercel/functions`의 `waitUntil` 로 프로미스를 등록하여
 * 백그라운드 작업이 끝날 때까지 런타임이 함수를 살려두도록 합니다.
 *
 * `waitUntil` 을 사용할 수 없는 환경(로컬 개발, 상시 구동 Node 서버, 테스트)에서는
 * 프로세스가 동결되지 않으므로 일반 fire-and-forget 으로 자연히 완료됩니다.
 *
 * @param promise 백그라운드에서 실행할 Promise
 * @param label 로깅용 레이블 (선택)
 */
export function backgroundTask<T>(promise: Promise<T>, label?: string): void {
  const tracked = promise
    .then((result) => {
      logger.info(`[BackgroundTask] ${label || 'Task'} completed successfully`);
      return result;
    })
    .catch((error) => {
      logger.error(`[BackgroundTask] ${label || 'Task'} failed:`, error as Error);
    });

  try {
    // 요청 컨텍스트가 있으면(서버리스) 작업을 요청 수명에 연결한다.
    waitUntil(tracked);
  } catch {
    // waitUntil 을 사용할 수 없는 환경: 상시 구동 프로세스이므로 fire-and-forget 으로 충분.
  }
}

/**
 * 여러 백그라운드 작업을 동시에 실행합니다.
 */
export function backgroundTasks(tasks: Array<{ promise: Promise<unknown>; label?: string }>): void {
  tasks.forEach((task) => backgroundTask(task.promise, task.label));
}
