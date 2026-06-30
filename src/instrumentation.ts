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
