import * as Sentry from '@sentry/nextjs';

/**
 * 예시값을 미설정으로 취급한다.
 *
 * env-validation 의 `isPlaceholderValue` 를 쓰지 않는 이유: 이 모듈은
 * `instrumentation-client.ts` 를 통해 **브라우저 번들**에도 들어간다. env-validation 은
 * logger 와 서버 전용 코드를 끌고 오므로, 거기서 import 하면 그 전부가 클라이언트로
 * 딸려 온다(Turbopack 이 경고로 알려 줬다). DSN 판별에 필요한 만큼만 여기 둔다.
 */
function looksUnset(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return true;
  return (
    v.includes('your-') ||
    v.includes('your_') ||
    v.includes('example') ||
    v.includes('changeme') ||
    v.includes('placeholder') ||
    v.includes('here')
  );
}

/**
 * Sentry 초기화 (서버/엣지/클라이언트 공용).
 *
 * **왜 필요한가.** uptime-kuma 는 HTTP 가용성만 본다 — 사이트가 통째로 죽으면 알지만,
 * 500 에러율이 튀거나 특정 사용자만 흐름이 깨지는 것은 못 본다. 2026-08-08 에 정확히
 * 그런 일이 있었다: 익명 헬스체크는 계속 200 이라 감시는 초록이었는데 **로그인한
 * 사용자만** 502 를 받고 있었고, 사용자가 알려줘서 알았다.
 *
 * **DSN 이 없으면 아무것도 하지 않는다.** 초기화를 건너뛰므로 네트워크 요청도, 성능
 * 오버헤드도 없다. 켜는 방법은 `SENTRY_DSN`(서버) / `NEXT_PUBLIC_SENTRY_DSN`(브라우저)를
 * 설정하는 것뿐이고, 그 전까지는 코드가 있어도 없는 것과 같다. 로컬 개발에서 실수로
 * 이벤트를 쏘지 않게 하는 장치이기도 하다.
 *
 * 플레이스홀더 값(`your-dsn-here` 등)도 미설정으로 취급한다 — env-validation 이 다른 변수에
 * 쓰는 것과 같은 기준이다. "설정한 줄 알았는데 예시값이었다" 가 가장 흔한 실패다.
 */
export function initSentry(runtime: 'server' | 'edge' | 'client'): void {
  const dsn =
    runtime === 'client'
      ? process.env.NEXT_PUBLIC_SENTRY_DSN
      : (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);

  if (!dsn || looksUnset(dsn)) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,

    // 릴리스를 배포 이미지의 SHA 에 맞춘다. 어떤 배포에서 터졌는지 알아야
    // 롤백 지점(.previous-image)과 대조할 수 있다.
    release: process.env.NEXT_PUBLIC_APP_VERSION || process.env.GITHUB_SHA,

    // 에러는 전부, 트레이스는 표본만. 이 앱은 단일 인스턴스라 트레이싱 비용이
    // 곧 사용자 지연이 된다. 프로덕션 10% 는 추세를 보기에 충분하다.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

    // 세션 리플레이는 켜지 않는다. SR 본문과 고객사 정보가 화면에 그대로 있어
    // 리플레이는 PII 를 외부로 내보내는 것과 같다.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // 요청 본문·쿠키·헤더를 보내지 않는다. 세션 쿠키에는 인증 토큰이 들어 있고,
    // 요청 본문에는 SR 내용이 들어 있다. 스택 트레이스만으로도 대부분 잡힌다.
    sendDefaultPii: false,

    beforeSend(event) {
      // 혹시 남아 있을 수 있는 헤더/쿠키를 한 번 더 턴다.
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
      }
      return event;
    },
  });
}
