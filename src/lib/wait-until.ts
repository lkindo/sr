/**
 * 백그라운드 작업을 실행합니다.
 * Promise를 fire-and-forget 방식으로 실행하며 에러 로깅을 처리합니다.
 * 
 * @param promise 백그라운드에서 실행할 Promise
 * @param label 로깅용 레이블 (선택)
 */
export async function backgroundTask<T>(
    promise: Promise<T>,
    label?: string
): Promise<void> {
    // Promise를 fire-and-forget으로 실행
    promise
        .then((result) => {
            console.log(`[BackgroundTask] ${label || 'Task'} completed successfully`);
            return result;
        })
        .catch((error) => {
            console.error(`[BackgroundTask] ${label || 'Task'} failed:`, error);
        });
}

/**
 * 여러 백그라운드 작업을 동시에 실행합니다.
 */
export async function backgroundTasks(
    tasks: Array<{ promise: Promise<unknown>; label?: string }>
): Promise<void> {
    tasks.forEach(task => backgroundTask(task.promise, task.label));
}

