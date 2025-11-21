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
    // E2E 테스트 중이거나 명시적으로 비활성화된 경우 검증 스킵
    if (process.env.SKIP_ENV_VALIDATION === 'true' || process.env.PLAYWRIGHT_TEST === 'true') {
      console.log('✅ Instrumentation registered (env validation skipped for testing)');
      return;
    }

    // 환경 변수 검증 활성화
    const { validateAndPrintEnv } = await import('./src/lib/env-validation');
    validateAndPrintEnv();
  }
}
