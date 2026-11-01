import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 모든 API 라우트의 인증 게이트를 소스의 구문 트리에서 전수 확인한다.
 *
 * 라우트 테스트 대부분은 인증을 목으로 대체해서, 핸들러에서 래퍼를 빼도 그대로 통과한다.
 * 새 라우트가 인증 없이 추가되는 일은 이 파일이 막는다. 해석하지 못한 export 형태는 실패로 본다.
 * 공개로 두려면 아래 목록에 이유와 함께 넣는다.
 */
const API_ROOT = path.join('src', 'app', 'api');
const ROUTE_FILE = /^route\.(ts|tsx|js|jsx)$/;
const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const AUTH_WRAPPERS = new Set(['withAuth', 'withAuthAndRateLimit']);
const AUTH_WRAPPER_MODULE = '@/lib/auth-wrapper';

/** 세션 없이 호출되는 것이 의도인 라우트. */
const PUBLIC_ROUTES: Record<string, string> = {
  'auth/[...nextauth]': 'Auth.js 자체 엔드포인트',
  'clients/public': '가입 화면의 고객사 선택',
  health: '컨테이너·nginx 헬스체크',
  'push/vapid-key': '브라우저 구독에 필요한 공개키',
  'register/verify-email': '가입 전 이메일 확인',
};

/** 래퍼 대신 핸들러 안에서 직접 세션을 확인하는 핸들러. 메서드별로 적는다. */
const SELF_AUTHENTICATED_HANDLERS: Record<string, string[]> = {
  realtime: ['GET'],
};
const SESSION_CHECK = /const session = await auth\(\);\s+if \(!session\?\.user\?\.id\)/;

interface Handler {
  method: string;
  /** 인증 여부를 판정할 수 있는 형태가 아니면 이유를 담는다. */
  problem: string | null;
  bodyText: string;
}

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : routeFiles(entryPath);
    return ROUTE_FILE.test(entry.name) ? [entryPath] : [];
  });
}

/** 별칭까지 따라가, 인증 래퍼를 가리키는 지역 이름만 모은다. */
function authWrapperNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if ((statement.moduleSpecifier as ts.StringLiteral).text !== AUTH_WRAPPER_MODULE) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (AUTH_WRAPPERS.has((element.propertyName ?? element.name).text)) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

const isExported = (node: ts.HasModifiers) =>
  ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

function handlersOf(source: ts.SourceFile): Handler[] {
  const wrappers = authWrapperNames(source);
  const handlers: Handler[] = [];

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const method = declaration.name.getText(source);
        if (!HTTP_METHODS.has(method)) continue;
        const init = declaration.initializer;
        const wrapped =
          init &&
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          wrappers.has(init.expression.text);
        handlers.push({
          method,
          problem: wrapped ? null : '인증 래퍼로 감싸지 않았습니다',
          bodyText: init?.getText(source) ?? '',
        });
      }
    }

    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name) {
      if (HTTP_METHODS.has(statement.name.text)) {
        handlers.push({
          method: statement.name.text,
          problem: '인증 래퍼로 감싸지 않았습니다',
          bodyText: statement.getText(source),
        });
      }
    }

    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (!clause) {
        handlers.push({ method: '*', problem: 'export * 는 판정할 수 없습니다', bodyText: '' });
      } else if (ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (HTTP_METHODS.has(element.name.text)) {
            handlers.push({
              method: element.name.text,
              problem: '다시 내보낸 핸들러는 판정할 수 없습니다',
              bodyText: '',
            });
          }
        }
      }
    }
  }

  return handlers;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function problemsIn(name: string, handlers: Handler[]): string[] {
  return handlers.flatMap(({ method, problem, bodyText }) => {
    if (!problem) return [];
    if (SELF_AUTHENTICATED_HANDLERS[name]?.includes(method) && SESSION_CHECK.test(bodyText)) {
      return [];
    }
    return [`${name} ${method}: ${problem}`];
  });
}

const routes = routeFiles(API_ROOT).map((file) => ({
  name: path.relative(API_ROOT, path.dirname(file)).split(path.sep).join('/'),
  handlers: handlersOf(parse(file)),
}));

const protectedRoutes = routes.filter(({ name }) => !(name in PUBLIC_ROUTES));

describe('API 라우트 인증 게이트', () => {
  it('라우트를 실제로 찾는다', () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  it.each(protectedRoutes.map(({ name, handlers }) => [name, handlers] as const))(
    '%s 의 모든 핸들러가 인증을 거친다',
    (name, handlers) => {
      expect(handlers.length).toBeGreaterThan(0);
      expect(problemsIn(name, handlers)).toEqual([]);
    }
  );

  it('공개·자체 인증 목록에 지워진 라우트가 남아 있지 않다', () => {
    const names = new Set(routes.map((route) => route.name));

    for (const name of [
      ...Object.keys(PUBLIC_ROUTES),
      ...Object.keys(SELF_AUTHENTICATED_HANDLERS),
    ]) {
      expect(names.has(name), name).toBe(true);
    }
  });
});

describe('검사기 자체', () => {
  const check = (name: string, code: string) =>
    problemsIn(
      name,
      handlersOf(ts.createSourceFile('route.ts', code, ts.ScriptTarget.Latest, true))
    );

  it.each([
    ['래퍼 없는 함수', `export async function POST() {}`],
    ['동기 함수', `export function GET() {}`],
    ['HEAD', `export function HEAD() {}`],
    ['다시 내보내기', `export { unsafe as POST } from './handlers';`],
    ['export *', `export * from './handlers';`],
    [
      '인증이 아닌 래퍼를 별칭으로',
      `import { withErrorHandler as withAuth } from '@/lib/auth-wrapper';
       export const POST = withAuth(async () => {});`,
    ],
    ['다른 모듈의 같은 이름', `import { withAuth } from './x'; export const POST = withAuth(f);`],
  ])('%s 은(는) 실패로 본다', (_label, code) => {
    expect(check('sample', code)).not.toEqual([]);
  });

  it('인증 래퍼의 별칭은 따라간다', () => {
    const code = `import { withAuth as guard } from '@/lib/auth-wrapper';
      export const GET = guard(async () => {});`;

    expect(check('sample', code)).toEqual([]);
  });

  it('자체 인증 예외는 지정한 메서드에만 적용된다', () => {
    const code = `export async function GET() {
        const session = await auth();
        if (!session?.user?.id) return null;
      }
      export async function POST() {}`;

    expect(check('realtime', code)).toEqual(['realtime POST: 인증 래퍼로 감싸지 않았습니다']);
  });
});
