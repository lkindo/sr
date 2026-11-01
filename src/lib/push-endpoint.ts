/**
 * 웹 푸시 구독 endpoint 가 브라우저 벤더의 푸시 서비스인지 판정한다.
 *
 * endpoint 는 브라우저가 만들어 주는 값이지만 API 입력이라 로그인 사용자가 임의로 보낼 수 있고,
 * 서버는 그 주소로 POST 한다. 허용 목록이 없으면 서버를 경유해 임의 HTTPS 주소를 호출하는
 * SSRF 가 된다.
 */
const PUSH_SERVICE_HOSTS: ReadonlySet<string> = new Set([
  'fcm.googleapis.com', // Chrome, Samsung Internet, Opera, Brave
  'web.push.apple.com', // Safari
]);

const PUSH_SERVICE_HOST_SUFFIXES: readonly string[] = [
  '.push.services.mozilla.com', // Firefox
  '.notify.windows.com', // Edge
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  // web-push 는 옛 `url.parse` 로 주소를 읽는다. 파서가 다르게 해석하는 입력으로 검사를
  // 우회하지 못하도록 정규화 결과와 글자까지 같은 주소만 받는다.
  if (url.href !== endpoint) return false;
  if (url.protocol !== 'https:' || url.port !== '') return false;
  if (url.username !== '' || url.password !== '') return false;

  const host = url.hostname;
  return (
    PUSH_SERVICE_HOSTS.has(host) ||
    PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}
