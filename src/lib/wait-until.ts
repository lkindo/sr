/**
 * Vercel Serverless 환경에서 응답 후에도 백그라운드 작업을 완료할 수 있도록 합니다.
 * 로컬 환경에서는 일반적인 Promise로 동작합니다.
 * 
 * @see https://vercel.com/docs/functions/functions-api-reference#waituntil
 */

let vercelWaitUntil: ((promise: Promise<unknown>) => void) | null = null;

// Vercel 환경에서만 @vercel/functions 모듈 로드 시도
if (process.env.VERCEL) {
    try {
        // Dynamic import to avoid bundling issues in non-Vercel environments
        import('@vercel/functions').then((mod) => {
            vercelWaitUntil = mod.waitUntil;
        }).catch(() => {
            // Silently fail if module not available
        });
    } catch {
        // Silently fail
    }
}

/**
 * 백그라운드 작업을 등록합니다.
 * Vercel 환경: waitUntil()로 응답 후에도 작업 완료 보장
 * 로컬 환경: 일반 Promise 실행 (fire-and-forget, 프로세스가 살아있으므로 완료됨)
 * 
 * @param promise 백그라운드에서 실행할 Promise
 * @param label 로깅용 레이블 (선택)
 */
export function backgroundTask<T>(
    promise: Promise<T>,
    label?: string
): void {
    const wrappedPromise = promise
        .then((result) => {
            if (label) {
                console.log(`[BackgroundTask] ${label} completed successfully`);
            }
            return result;
        })
        .catch((error) => {
            console.error(`[BackgroundTask] ${label || 'Task'} failed:`, error);
        });

    if (vercelWaitUntil) {
        vercelWaitUntil(wrappedPromise);
    }
    // 로컬 환경에서는 Promise가 자연스럽게 실행됨 (Node.js 프로세스 유지)
}

/**
 * 여러 백그라운드 작업을 동시에 등록합니다.
 */
export function backgroundTasks(
    tasks: Array<{ promise: Promise<unknown>; label?: string }>
): void {
    for (const task of tasks) {
        backgroundTask(task.promise, task.label);
    }
}
