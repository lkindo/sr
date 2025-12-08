/**
 * Vercel Serverless 환경에서 응답 후에도 백그라운드 작업을 완료할 수 있도록 합니다.
 * 
 * @see https://vercel.com/docs/functions/functions-api-reference#waituntil
 */

/**
 * 백그라운드 작업을 등록합니다.
 * Vercel 환경: waitUntil()로 응답 후에도 작업 완료 보장
 * 로컬 환경: 일반 Promise 실행
 * 
 * @param promise 백그라운드에서 실행할 Promise
 * @param label 로깅용 레이블 (선택)
 */
export async function backgroundTask<T>(
    promise: Promise<T>,
    label?: string
): Promise<void> {
    const wrappedPromise = promise
        .then((result) => {
            console.log(`[BackgroundTask] ${label || 'Task'} completed successfully`);
            return result;
        })
        .catch((error) => {
            console.error(`[BackgroundTask] ${label || 'Task'} failed:`, error);
        });

    // Vercel 환경에서 waitUntil 사용
    if (process.env.VERCEL) {
        try {
            const { waitUntil } = await import('@vercel/functions');
            waitUntil(wrappedPromise);
            console.log(`[BackgroundTask] ${label || 'Task'} registered with waitUntil`);
        } catch (error) {
            console.warn('[BackgroundTask] waitUntil not available, running inline:', error);
            // waitUntil을 사용할 수 없으면 동기적으로 대기
            await wrappedPromise;
        }
    }
    // 로컬 환경에서는 Promise가 자연스럽게 실행됨
}

/**
 * 여러 백그라운드 작업을 동시에 등록합니다.
 */
export async function backgroundTasks(
    tasks: Array<{ promise: Promise<unknown>; label?: string }>
): Promise<void> {
    await Promise.all(tasks.map(task => backgroundTask(task.promise, task.label)));
}
