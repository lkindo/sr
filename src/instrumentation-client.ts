/**
 * 브라우저 계측 훅 (Next.js 15+).
 *
 * 이 파일은 클라이언트 번들의 가장 앞에서 한 번 실행된다. 서버 쪽 `instrumentation.ts`
 * 와 짝을 이루며, 둘 다 있어야 "서버에서 터진 것"과 "브라우저에서 터진 것"이 모두
 * 잡힌다. 서버만 붙이면 렌더 이후 사용자 화면에서 나는 예외는 아무 데도 남지 않는다.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` 이 없으면 initSentry 가 즉시 반환한다 — 번들에 코드는
 * 들어가지만 실행 시 아무 일도 하지 않는다.
 */
import { initSentry } from '@/lib/sentry-init';

initSentry('client');

/**
 * 클라이언트 라우팅 전환 계측. Sentry 가 페이지 이동을 트랜잭션 경계로 인식하려면
 * 이 훅을 내보내야 한다. DSN 이 없으면 Sentry 가 초기화되지 않았으므로 no-op 이다.
 */
export { captureRouterTransitionStart as onRouterTransitionStart } from '@sentry/nextjs';
