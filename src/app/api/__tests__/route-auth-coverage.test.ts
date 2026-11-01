import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 모든 API 라우트의 인증 게이트를 소스에서 전수 확인한다.
 *
 * 라우트 테스트 대부분은 인증을 목으로 대체해서, 핸들러에서 래퍼를 빼도 그대로 통과한다.
 * 새 라우트가 인증 없이 추가되는 일은 이 파일이 막는다. 공개로 두려면 아래 목록에 이유와 함께 넣는다.
 */
const API_ROOT = path.join('src', 'app', 'api');

/** 세션 없이 호출되는 것이 의도인 라우트. */
const PUBLIC_ROUTES: Record<string, string> = {
  'auth/[...nextauth]': 'Auth.js 자체 엔드포인트',
  'clients/public': '가입 화면의 고객사 선택',
  health: '컨테이너·nginx 헬스체크',
  'push/vapid-key': '브라우저 구독에 필요한 공개키',
  'register/verify-email': '가입 전 이메일 확인',
};

/** 래퍼 대신 핸들러 안에서 직접 세션을 확인하는 라우트. */
const SELF_AUTHENTICATED_ROUTES: Record<string, RegExp> = {
  realtime: /const session = await auth\(\);\s+if \(!session\?\.user\?\.id\)/,
};

const AUTH_WRAPPERS = /^(withAuth|withAuthAndRateLimit)\b/;
const HTTP_EXPORT =
  /^export (?:const (GET|POST|PUT|PATCH|DELETE) = (.*)|async function (GET|POST|PUT|PATCH|DELETE)\b)/gm;

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : routeFiles(entryPath);
    return entry.name === 'route.ts' ? [entryPath] : [];
  });
}

const routes = routeFiles(API_ROOT).map((file) => ({
  file,
  name: path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/'),
  source: fs.readFileSync(file, 'utf8'),
}));

const protectedRoutes = routes.filter(({ name }) => !(name in PUBLIC_ROUTES));

describe('API 라우트 인증 게이트', () => {
  it('라우트를 실제로 찾는다', () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it.each(protectedRoutes.map((route) => [route.name, route] as const))(
    '%s 의 모든 핸들러가 인증을 거친다',
    (name, { source }) => {
      const handlers = [...source.matchAll(HTTP_EXPORT)];
      expect(handlers.length).toBeGreaterThan(0);

      const selfCheck = SELF_AUTHENTICATED_ROUTES[name];
      if (selfCheck) {
        expect(source).toMatch(selfCheck);
        return;
      }

      for (const [statement, , wrappedBy] of handlers) {
        expect(wrappedBy ?? statement, `${name}: ${statement}`).toMatch(AUTH_WRAPPERS);
      }
    }
  );

  it('공개·자체 인증 목록에 지워진 라우트가 남아 있지 않다', () => {
    const names = new Set(routes.map((route) => route.name));

    for (const name of [...Object.keys(PUBLIC_ROUTES), ...Object.keys(SELF_AUTHENTICATED_ROUTES)]) {
      expect(names.has(name), name).toBe(true);
    }
  });
});
