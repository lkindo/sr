/**
 * E2E 스펙의 "검증하는 척하는 코드"를 막는 게이트.
 *
 * ── 이 파일의 내력 ───────────────────────────────────────────────────────
 * 처음(감사 3.34)에는 규칙이 하나였다: 각 test 본문에 `expect(` 가 하나라도 있는가.
 * 보안·권한상승 E2E 가 `expect` 대신 `console.log` 로 결과를 "확인"하고 있었기 때문이다.
 * 그런 테스트는 통제가 완전히 사라져도 초록불이라, 있으나 마나 한 정도가 아니라
 * 회귀를 못 잡으면서 잡고 있다고 착각하게 만든다.
 *
 * 그런데 그 규칙은 **한 번도 실행된 적이 없었다.** classifyCall 이 `test.describe` 를
 * 'exempt' 로 분류했고 findOffenders 가 exempt 를 만나면 하위 트리 전체를 건너뛰었다.
 * 이 저장소의 test 169개는 100% 가 describe 안에 있으므로 검사 대상은 0개였다.
 * `pnpm check:e2e-assertions` 도 CI(ci-cd.yml)도 계속 초록불이었고, 그 아래에
 * 단언 없는 테스트 13건이 그대로 쌓여 있었다. 아래 R0 이 그 버그를 고친 것이다.
 *
 * 동시에, 원래 주석이 스스로 인정했던 한계 — "`expect(x).toBeGreaterThanOrEqual(0)`
 * 같은 항상-참 단언은 단언이 '있으므로' 통과한다. 사람 리뷰가 필요하다" — 를
 * 기계로 옮겼다(R2). 그리고 더 흔한 형태인 "요소를 못 찾으면 로그만 남기고 통과"(R1)와
 * 그 형태를 가능하게 만드는 고정 대기(R3)를 함께 예산화했다.
 *
 * ── 규칙 ─────────────────────────────────────────────────────────────────
 *  R0 no-assertion    test 본문에 단언이 없다               (예산 없음: 무조건 실패)
 *  R1 tolerant-branch 관측 분기의 한쪽이 로그뿐이다          (파일별 래칫 예산)
 *  R2 vacuous-assert  항상 참인 단언                        (파일별 래칫 예산)
 *  R3 fixed-wait      page.waitForTimeout 호출 수와 총 ms   (파일별 래칫 예산)
 *  S  skip            조건 없는 test.skip                   (예산 없음: 무조건 실패)
 *
 * R0 과 S 에 예산을 주지 않는 이유: 둘 다 "그 테스트가 통째로 아무것도 안 한다"는
 * 뜻이라 점진 상환의 대상이 아니다. 미구현이면 `test.fixme` 가 이미 정답이다.
 * 다만 R0 은 도입 시점에 13건이 존재하므로 baseline.json 의 `noAssertionAllowlist` 로
 * 명시 유예한다 — 목록에 이름이 박히므로 늘리려면 diff 에 남는다.
 *
 * ── 래칫 ─────────────────────────────────────────────────────────────────
 * 이 저장소의 관례를 따른다: 단조 감소 예산 + 근거를 주석으로 문서화.
 *   package.json  eslint --max-warnings 882 / knip --max-issues 4
 *   vitest.config.ts  커버리지 임계값과 실측 기준선 주석
 *   ci-cd.yml  "숫자를 올려서 통과시키는 것을 금지한다"
 *
 * 다만 여기서는 **스칼라가 아니라 파일별 예산**을 쓴다. 이유가 있다:
 * R1 의 54%, R3 의 48% 가 네 파일(19/20/21/22)에 몰려 있고 그중 일부는 삭제 예정이다.
 * 스칼라 예산이면 그 파일을 지우는 순간 수십 칸이 "무상으로" 열리고, 그 여유분은
 * 다른 파일의 새 위반을 조용히 흡수한다. 파일별 예산은 삭제된 파일의 예산도 함께
 * 소멸시켜 그 흡수를 원천 차단한다. 또 "22가 나빠지고 19가 좋아진" PR 을 총량
 * 유지로 통과시키는 일도 막는다 — 결함이 옮겨 다니는 것은 개선이 아니다.
 *
 * 기준선보다 **낮아져도 실패**시킨다. 개선했으면 `--update` 로 예산을 함께 내려서
 * 감소분이 diff 에 남아야 한다. 이 마찰이 래칫의 본체다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/check-e2e-assertions.ts            # 검사
 *   pnpm exec tsx scripts/check-e2e-assertions.ts --update   # 기준선 갱신
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const REPO_ROOT = join(__dirname, '..');
const E2E_DIR = join(REPO_ROOT, 'e2e');
const BASELINE_PATH = join(__dirname, 'e2e-gate-baseline.json');

// ============================================================================
// 기준선 파일 형식
// ============================================================================

interface FileBudget {
  tolerantBranch: number;
  vacuousAssertion: number;
  fixedWaitCalls: number;
  fixedWaitMs: number;
}

interface Baseline {
  /** 기준선의 의미와 갱신 규칙 (사람용) */
  $comment: string[];
  /**
   * 단언 없이 통과가 허용된 테스트. `<파일>:<테스트 제목>` 형태.
   * 라인 번호를 쓰지 않는 이유: 위쪽에 한 줄만 추가돼도 전부 어긋나 매 PR 이
   * 무의미한 갱신을 요구하고, 그러면 아무도 목록을 읽지 않게 된다.
   */
  noAssertionAllowlist: string[];
  /** 파일별 예산. 키는 e2e/ 기준 상대경로(슬래시 구분). */
  files: Record<string, FileBudget>;
}

const EMPTY_BUDGET: FileBudget = {
  tolerantBranch: 0,
  vacuousAssertion: 0,
  fixedWaitCalls: 0,
  fixedWaitMs: 0,
};

// ============================================================================
// 파일 수집
// ============================================================================

function listFiles(dir: string, base: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full, base, suffix));
    } else if (entry.endsWith(suffix)) {
      out.push(relative(base, full).split('\\').join('/'));
    }
  }
  return out;
}

function parse(relPath: string): ts.SourceFile {
  const full = join(E2E_DIR, relPath);
  return ts.createSourceFile(full, readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true);
}

// ============================================================================
// 공통 판별기
// ============================================================================

/** `test(...)` / `it(...)` / `test.only(...)` — 실제로 실행되는 테스트 선언인가? */
function isRunnableTestCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'test' || callee.text === 'it';
  if (ts.isPropertyAccessExpression(callee)) {
    const root = callee.expression;
    if (!ts.isIdentifier(root) || (root.text !== 'test' && root.text !== 'it')) return false;
    return callee.name.text === 'only';
  }
  return false;
}

/** `test.skip(...)` / `test.fixme(...)` — 실행되지 않으므로 검사 대상이 아니다. */
function isExemptTestCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const root = callee.expression;
  if (!ts.isIdentifier(root) || (root.text !== 'test' && root.text !== 'it')) return false;
  return callee.name.text === 'skip' || callee.name.text === 'fixme';
}

function testTitle(node: ts.CallExpression): string {
  const first = node.arguments[0];
  return first && ts.isStringLiteralLike(first) ? first.text : '(제목 불명)';
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * 각 `test()` 선언을 방문한다.
 *
 * 예전 구현은 `test.describe` 를 만나면 `return` 으로 하위 트리를 통째로 건너뛰었다.
 * describe 자체는 검사 대상이 아니지만 **그 안의 test 는 검사해야 한다** — 이 저장소의
 * test 는 전부 describe 안에 있으므로, 그 한 줄이 게이트 전체를 무력화하고 있었다.
 */
function forEachTest(
  sf: ts.SourceFile,
  visitor: (node: ts.CallExpression, body: ts.Node) => void
): void {
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (isExemptTestCall(node)) return; // 하위 트리까지 건너뛴다 (명시적 미실행)
      if (isRunnableTestCall(node)) {
        const body = node.arguments[node.arguments.length - 1];
        if (body) visitor(node, body);
        return;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

/** 해당 노드가 어떤 `test()` 본문 안에 있는가? (setup 훅·모듈 최상단 제외) */
function isInsideTestBody(node: ts.Node): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && isRunnableTestCall(p)) return true;
  }
  return false;
}

// ============================================================================
// R0 — 단언 없는 테스트
// ============================================================================

/**
 * `expect` 로 단언하는 헬퍼 이름들.
 *
 * 헬퍼 1홉 추적이 필요한 이유: 30-accessibility.spec.ts 의 5개 테스트는 본문에
 * `expect` 가 없지만 `checkA11y()` 안의 `expect(violations).toEqual([])` 로 검증한다.
 * 이걸 오탐으로 신고하면 게이트가 "단언을 헬퍼로 빼지 말라"고 강요하는 셈이 되고,
 * 그건 이 저장소가 지향하는 방향(계약을 헬퍼에 넣어 재사용)과 정반대다.
 */
function collectAssertingHelpers(): Set<string> {
  const names = new Set<string>();
  const helperFiles = listFiles(join(E2E_DIR, 'helpers'), E2E_DIR, '.ts');

  for (const rel of helperFiles) {
    const sf = parse(rel);
    const visit = (node: ts.Node) => {
      let name: string | undefined;
      let body: ts.Node | undefined;

      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        name = node.name.text;
        body = node.body;
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        name = node.name.text;
        body = node.initializer.body;
      }

      if (name && body && containsExpect(body)) names.add(name);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return names;
}

function containsExpect(body: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && callee.text === 'expect') {
        found = true;
        return;
      }
      // expect.soft(...) / expect.poll(...) 등도 단언으로 인정한다.
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'expect'
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

function containsAssertingHelperCall(body: ts.Node, helpers: Set<string>): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && helpers.has(callee.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

interface NoAssertionOffender {
  file: string;
  line: number;
  title: string;
  key: string;
}

function findNoAssertion(
  sf: ts.SourceFile,
  file: string,
  helpers: Set<string>
): NoAssertionOffender[] {
  const out: NoAssertionOffender[] = [];
  forEachTest(sf, (node, body) => {
    if (containsExpect(body)) return;
    if (containsAssertingHelperCall(body, helpers)) return;
    const title = testTitle(node);
    out.push({ file, line: lineOf(sf, node), title, key: `${file}:${title}` });
  });
  return out;
}

// ============================================================================
// R1 — 관용 분기 (요소를 못 찾으면 로그만 남기고 통과)
// ============================================================================

/**
 * "요소 상태 관측" 으로 인정하는 Playwright 메서드.
 *
 * 조건식을 무엇으로 한정하느냐가 이 규칙의 오탐/미탐을 결정한다. `await 가 있으면 관측`
 * 으로 넓게 잡으면 API 응답 페이로드를 찍어 보는 진단 출력까지 걸린다
 * (예: `if (statsResponse.byStatus) console.log(...)`). 그건 "요소를 못 찾으면 통과"가
 * 아니라 그냥 디버그 로그다. 그래서 요소/페이지 상태 조회에 한정한다.
 */
const OBSERVATION_METHODS = new Set([
  'isVisible',
  'isHidden',
  'isEnabled',
  'isDisabled',
  'isChecked',
  'isEditable',
  'count',
  'url',
  'textContent',
  'innerText',
  'inputValue',
  'getAttribute',
  'allTextContents',
  'allInnerTexts',
]);

/** 조건식에서 관측 메서드를 직접 호출하는가? (콜백 본문 안쪽은 보지 않는다) */
function callsObservationMethod(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    // `page.waitForResponse((r) => r.url().includes(...))` 의 r.url() 을 관측으로
    // 오인하지 않도록 콜백 본문에는 내려가지 않는다.
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      if (OBSERVATION_METHODS.has(n.expression.name.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** 식별자를 선언까지 거슬러 올라가 초기화식을 찾는다 (같은 파일, 바깥 스코프로 확장). */
function findInitializer(name: string, from: ts.Node): ts.Expression | undefined {
  for (let scope: ts.Node | undefined = from; scope; scope = scope.parent) {
    const statements: readonly ts.Statement[] | undefined = ts.isBlock(scope)
      ? scope.statements
      : ts.isSourceFile(scope)
        ? scope.statements
        : undefined;
    if (!statements) continue;

    for (const stmt of statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer) {
          return decl.initializer;
        }
      }
    }
  }
  return undefined;
}

/** 표현식 안에서 (콜백 본문을 제외하고) 참조하는 식별자 이름들. */
function referencedIdentifiers(node: ts.Node): string[] {
  const names: string[] = [];
  const collect = (n: ts.Node) => {
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
    // `foo.bar` 의 `bar` 는 속성명이지 변수가 아니다.
    if (ts.isPropertyAccessExpression(n)) {
      collect(n.expression);
      return;
    }
    if (ts.isIdentifier(n)) names.push(n.text);
    ts.forEachChild(n, collect);
  };
  collect(node);
  return names;
}

/**
 * 조건식이 "요소 관측"에서 왔는가?
 *
 * 직접 호출이거나, 조건에 쓰인 식별자를 최대 3홉까지 거슬러 올라갔을 때 관측에 닿으면 인정한다.
 * 홉마다 "식별자 → 초기화식" 을 따라가되, 그 초기화식이 다시 참조하는 식별자들도 함께 넓힌다.
 * 식별자 → 식별자 직결만 따라가면 두 단계 유도를 놓친다. 실제 사례:
 *   const pageText = (await page.locator('body').textContent()) || '';
 *   const hasEmail = pageText.includes('@');
 *   if (hasEmail) { console.log('✅ 이메일 정보 표시 확인'); } else if (...) { ... }
 * `hasEmail` 의 초기화식은 CallExpression 이라 직결 추적이 거기서 끊긴다.
 */
function isObservationCondition(condition: ts.Expression): boolean {
  if (callsObservationMethod(condition)) return true;

  let frontier = referencedIdentifiers(condition);
  const seen = new Set<string>(frontier);

  for (let hop = 0; hop < 3 && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const name of frontier) {
      const init = findInitializer(name, condition);
      if (!init) continue;
      if (callsObservationMethod(init)) return true;
      for (const ref of referencedIdentifiers(init)) {
        if (seen.has(ref)) continue;
        seen.add(ref);
        next.push(ref);
      }
    }
    frontier = next;
  }
  return false;
}

/** `process.env.X` 같은 환경 분기는 관용 분기가 아니다. */
function referencesProcess(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === 'process') {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function isConsoleCall(stmt: ts.Statement): ts.CallExpression | null {
  if (!ts.isExpressionStatement(stmt)) return null;
  let expr: ts.Expression = stmt.expression;
  if (ts.isAwaitExpression(expr)) expr = expr.expression;
  if (!ts.isCallExpression(expr)) return null;
  const callee = expr.expression;
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'console'
  ) {
    return expr;
  }
  return null;
}

/**
 * 분기 블록이 "죽어 있는가" — 로그와 흐름 제어뿐이고 단언이 하나도 없는가.
 *
 * `return;` / `break;` / `continue;` 를 허용 문장에 넣는 이유: 로그 뒤에 `return;` 한 줄만
 * 붙이면 규칙을 통과하는 우회로가 생기기 때문이다. 실제로 28-sr-activities-history 의
 * "활동 이력 탭을 찾을 수 없습니다. 테스트 통과." 가 정확히 그 형태였다.
 *
 * 다만 흐름 제어**만** 있는 블록은 죽은 분기가 아니다 — 그건 재시도 루프의 이탈이다:
 *   for (let retry = 0; retry < 3; retry++) {
 *     if (await userRow.isVisible(...).catch(() => false)) break;
 *     await page.reload(...);
 *   }
 * 루프 뒤에 `await expect(userRow).toBeVisible()` 이 무조건 실행되므로 조용한 통과가 아니다.
 * 그래서 "console 호출이 최소 1개" 를 함께 요구한다.
 *
 * 빈 블록(`if (cond) {}`)은 예외적으로 죽은 분기로 센다. console.log 를 지우기만 하면
 * 게이트를 통과하면서 코드는 더 나빠지는 경로를 미리 막는다.
 */
function isDeadBranch(branch: ts.Statement | undefined): boolean {
  if (!branch) return false;
  if (containsExpect(branch)) return false;

  const statements: readonly ts.Statement[] = ts.isBlock(branch) ? branch.statements : [branch];

  // 빈 블록도 죽은 분기다 (우회 차단용).
  if (statements.length === 0) return true;

  let consoleCalls = 0;
  for (const stmt of statements) {
    if (isConsoleCall(stmt)) {
      consoleCalls++;
      continue;
    }
    if (ts.isEmptyStatement(stmt)) continue;
    if (ts.isBreakStatement(stmt) || ts.isContinueStatement(stmt)) continue;
    if (ts.isReturnStatement(stmt) && !stmt.expression) continue;
    return false;
  }
  return consoleCalls > 0;
}

/**
 * "값 덤프" 제외 — 조건이 표현식 E 의 단순 진위 검사이고 console 인자에 E 가 그대로
 * 실려 있으면 그건 관측값을 찍어 보는 진단이지 "조용한 통과"가 아니다.
 * (예: `if (errorText) console.log('❌ 로그인 실패 에러:', errorText)` — 같은 테스트가
 *  뒤에서 무조건 단언한다.)
 */
function isValueDump(condition: ts.Expression, branch: ts.Statement | undefined): boolean {
  if (!branch) return false;
  let subject = condition;
  if (ts.isPrefixUnaryExpression(subject) && subject.operator === ts.SyntaxKind.ExclamationToken) {
    subject = subject.operand;
  }
  if (!ts.isIdentifier(subject)) return false;

  const statements: readonly ts.Statement[] = ts.isBlock(branch) ? branch.statements : [branch];
  for (const stmt of statements) {
    const call = isConsoleCall(stmt);
    if (!call) continue;
    for (const arg of call.arguments) {
      if (ts.isIdentifier(arg) && arg.text === subject.text) return true;
    }
  }
  return false;
}

interface RuleHit {
  file: string;
  line: number;
  detail: string;
}

function findTolerantBranches(sf: ts.SourceFile, file: string): RuleHit[] {
  const out: RuleHit[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isIfStatement(node) && isInsideTestBody(node)) {
      const cond = node.expression;
      if (!referencesProcess(cond) && isObservationCondition(cond)) {
        const thenDead = isDeadBranch(node.thenStatement) && !isValueDump(cond, node.thenStatement);
        // else-if 는 그 자체가 별개 IfStatement 로 순회되므로 여기서는 세지 않는다.
        const elseIsIf = node.elseStatement && ts.isIfStatement(node.elseStatement);
        const elseDead =
          !elseIsIf && isDeadBranch(node.elseStatement) && !isValueDump(cond, node.elseStatement);

        if (thenDead || elseDead) {
          const side = thenDead && elseDead ? 'both' : thenDead ? 'then' : 'else';
          out.push({
            file,
            line: lineOf(sf, node),
            detail: `${side === 'both' ? '양쪽 분기 모두' : `${side} 분기가`} 로그뿐 (단언 0)`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// ============================================================================
// R2 — 항상 참인 단언
// ============================================================================

/** `<expr>.length` / `await <expr>.count()` / `a ?? 0` — 정의상 0 이상인 값인가? */
function isProvablyNonNegative(expr: ts.Expression, scope: ts.Node): boolean {
  let node: ts.Expression = expr;
  if (ts.isAwaitExpression(node)) node = node.expression;

  if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') return true;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    if (node.expression.name.text === 'count') return true;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return isProvablyNonNegative(node.left, scope) || isProvablyNonNegative(node.right, scope);
  }

  // 같은 파일에서 위 형태로 초기화된 const 식별자까지만 인정한다.
  // let/var 은 재대입될 수 있으므로 제외 — 24-organization 의 `let sourceIndex = -1` 는
  // 탐색 결과를 담는 센티널이라 `>= 0` 이 진짜 단언이다.
  if (ts.isIdentifier(node)) {
    for (let s: ts.Node | undefined = scope; s; s = s.parent) {
      const statements: readonly ts.Statement[] | undefined = ts.isBlock(s)
        ? s.statements
        : ts.isSourceFile(s)
          ? s.statements
          : undefined;
      if (!statements) continue;
      for (const stmt of statements) {
        if (!ts.isVariableStatement(stmt)) continue;
        const isConst = (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0;
        if (!isConst) continue;
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === node.text && decl.initializer) {
            return isProvablyNonNegative(decl.initializer, scope);
          }
        }
      }
    }
  }
  return false;
}

function numericLiteralValue(arg: ts.Expression | undefined): number | undefined {
  if (!arg) return undefined;
  if (ts.isNumericLiteral(arg)) return Number(arg.text);
  if (
    ts.isPrefixUnaryExpression(arg) &&
    arg.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(arg.operand)
  ) {
    return -Number(arg.operand.text);
  }
  if (ts.isIdentifier(arg) && arg.text === 'Infinity') return Infinity;
  return undefined;
}

/** `expect(subject).<...>.matcher(arg)` 체인을 풀어 (subject, matcher, negated, arg) 로. */
function unwrapExpectChain(
  call: ts.CallExpression
): { subject: ts.Expression; matcher: string; negated: boolean; arg?: ts.Expression } | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const matcher = call.expression.name.text;

  let cursor: ts.Expression = call.expression.expression;
  let negated = false;
  while (ts.isPropertyAccessExpression(cursor)) {
    if (cursor.name.text === 'not') negated = !negated;
    cursor = cursor.expression;
  }
  if (!ts.isCallExpression(cursor)) return null;
  if (!ts.isIdentifier(cursor.expression) || cursor.expression.text !== 'expect') return null;
  const subject = cursor.arguments[0];
  if (!subject) return null;

  return { subject, matcher, negated, arg: call.arguments[0] };
}

function findVacuousAssertions(sf: ts.SourceFile, file: string): RuleHit[] {
  const out: RuleHit[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const chain = unwrapExpectChain(node);
      if (chain && !chain.negated) {
        const { subject, matcher, arg } = chain;
        const bound = numericLiteralValue(arg);

        // (a) 무의미한 수치 하한 — 주어가 정의상 0 이상임이 증명될 때만.
        const isVacuousBound =
          (matcher === 'toBeGreaterThanOrEqual' && bound !== undefined && bound <= 0) ||
          (matcher === 'toBeGreaterThan' && bound !== undefined && bound < 0) ||
          (matcher === 'toBeLessThan' && bound === Infinity) ||
          (matcher === 'toBeLessThanOrEqual' && bound === Infinity);
        if (isVacuousBound && isProvablyNonNegative(subject, node)) {
          out.push({
            file,
            line: lineOf(sf, node),
            detail: `${matcher}(${arg?.getText(sf) ?? ''}) — 주어가 항상 0 이상이라 언제나 참`,
          });
        }

        // (c) 논리 결합으로 약화된 진리값 단언.
        if (
          (matcher === 'toBeTruthy' || matcher === 'toBeFalsy') &&
          ts.isBinaryExpression(subject)
        ) {
          const weakening =
            matcher === 'toBeTruthy'
              ? subject.operatorToken.kind === ts.SyntaxKind.BarBarToken
              : subject.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
          if (weakening) {
            out.push({
              file,
              line: lineOf(sf, node),
              detail: `${matcher}(A ${subject.operatorToken.getText(sf)} B) — 한쪽만 맞아도 통과`,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// ============================================================================
// R3 — 고정 대기
// ============================================================================

/**
 * 예외 표기: 대기 문장 **바로 위 줄**에 `// allow-fixed-wait -- <사유>`.
 *
 * 사유를 반드시 요구하는 이유는 전례가 있어서다. 이 게이트가 `test.skip()` 을 막았더니
 * 규칙을 문자로만 만족시키려고 `test.skip(true, '사유')` 로 바꾼 변경이 실제로 일어났다.
 * 마커만 달고 넘어가는 회피를 전제로 설계한다 — 그래서 예외 **개수 자체**도
 * 파일별 예산에서 차감되지 않고, 늘리려면 baseline diff 에 남는다.
 *
 * 정당한 예외는 "기다릴 이벤트가 존재하지 않는" 경우뿐이다:
 *  - 조건부 이탈이 있는 재시도 루프의 백오프 간격
 *  - Next.js 사전 컴파일 유발용 워밍업 (응답을 기다리는 게 목적이 아니다)
 */
const EXEMPTION_PATTERN = /allow-fixed-wait\s*--\s*(\S.*)$/;

function hasFixedWaitExemption(sf: ts.SourceFile, node: ts.Node): boolean {
  const full = sf.getFullText();
  // 대기 호출을 감싸는 문장을 찾아 그 앞 주석을 본다.
  let stmt: ts.Node = node;
  while (stmt.parent && !ts.isStatement(stmt)) stmt = stmt.parent;

  const ranges = ts.getLeadingCommentRanges(full, stmt.getFullStart()) ?? [];
  return ranges.some((r) => EXEMPTION_PATTERN.test(full.slice(r.pos, r.end)));
}

interface FixedWaitHit extends RuleHit {
  ms: number;
}

function findFixedWaits(sf: ts.SourceFile, file: string): FixedWaitHit[] {
  const out: FixedWaitHit[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'waitForTimeout'
    ) {
      if (!hasFixedWaitExemption(sf, node)) {
        const ms = numericLiteralValue(node.arguments[0]) ?? 0;
        out.push({
          file,
          line: lineOf(sf, node),
          ms: Number.isFinite(ms) ? ms : 0,
          detail: `waitForTimeout(${node.arguments[0]?.getText(sf) ?? ''})`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// ============================================================================
// S — 조건 없는 skip
// ============================================================================

/**
 * `test.skip()` (인자 없음) 과 `test.skip(true, …)` 은 런타임 동작이 같다: 조건 없이
 * 항상 건너뛴다. 스킵된 테스트는 리포트에서 실패가 아니라 "통과 아님"으로만 보여서
 * 화면 전체가 망가져도 CI 는 초록불이다. 2026-08 정비에서 29개가 쌓여 있었고,
 * 스킵을 단언으로 바꾸자 존재한 적 없는 테이블을 찾던 테스트, 호출되지 않는 API 를
 * 기다리던 테스트가 한꺼번에 드러났다.
 *
 * `if` 안의 스킵은 허용한다 — `if (!srId) test.skip(true, …)` 처럼 앞 단계 실패를
 * 이어받는 연쇄 가드는 실제로 조건부이고 Playwright 가 권장하는 형태다.
 */
function findUnconditionalSkips(sf: ts.SourceFile, file: string): RuleHit[] {
  const out: RuleHit[] = [];

  const isConditional = (node: ts.Node): boolean => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isIfStatement(p) || ts.isConditionalExpression(p)) return true;
      if (ts.isFunctionLike(p) && p.parent && ts.isCallExpression(p.parent)) return false;
    }
    return false;
  };

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      (node.expression.expression.text === 'test' || node.expression.expression.text === 'it') &&
      node.expression.name.text === 'skip'
    ) {
      const [first] = node.arguments;
      const unconditional =
        node.arguments.length === 0 || (first && first.kind === ts.SyntaxKind.TrueKeyword);
      if (unconditional && !isConditional(node)) {
        out.push({ file, line: lineOf(sf, node), detail: node.getText(sf).split('\n')[0]!.trim() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// ============================================================================
// 측정
// ============================================================================

interface Measurement {
  files: Record<string, FileBudget>;
  /**
   * 디스크에 실재하는 파일 목록.
   *
   * `files` 와 따로 두는 이유: 전 항목 0 인 파일은 기준선에서 빼기 때문에(깨끗한 파일까지
   * 나열하면 diff 가 무의미해진다) `files` 에 없다는 것만으로는 "삭제되었다" 를 알 수 없다.
   * 이 둘을 섞으면 마지막 위반을 고친 파일이 "삭제된 파일" 로 신고된다.
   */
  onDisk: Set<string>;
  noAssertion: NoAssertionOffender[];
  skips: RuleHit[];
  tolerantHits: RuleHit[];
  vacuousHits: RuleHit[];
  fixedWaitHits: FixedWaitHit[];
}

function measure(): Measurement {
  const specFiles = listFiles(E2E_DIR, E2E_DIR, '.spec.ts').sort();
  // R3 은 헬퍼/setup 까지 본다. 헬퍼 안의 고정 대기는 호출부마다 곱해지므로
  // 오히려 스펙 안의 것보다 비싸다 (test-helpers.ts 의 다이얼로그 대기가 그 예다).
  const allFiles = listFiles(E2E_DIR, E2E_DIR, '.ts')
    .filter((f) => !f.endsWith('.d.ts'))
    .sort();

  const helpers = collectAssertingHelpers();

  const files: Record<string, FileBudget> = {};
  const ensure = (f: string): FileBudget => (files[f] ??= { ...EMPTY_BUDGET });

  const noAssertion: NoAssertionOffender[] = [];
  const skips: RuleHit[] = [];
  const tolerantHits: RuleHit[] = [];
  const vacuousHits: RuleHit[] = [];
  const fixedWaitHits: FixedWaitHit[] = [];

  for (const file of specFiles) {
    const sf = parse(file);
    noAssertion.push(...findNoAssertion(sf, file, helpers));
    skips.push(...findUnconditionalSkips(sf, file));

    const tolerant = findTolerantBranches(sf, file);
    const vacuous = findVacuousAssertions(sf, file);
    tolerantHits.push(...tolerant);
    vacuousHits.push(...vacuous);

    const budget = ensure(file);
    budget.tolerantBranch = tolerant.length;
    budget.vacuousAssertion = vacuous.length;
  }

  for (const file of allFiles) {
    const sf = parse(file);
    const waits = findFixedWaits(sf, file);
    if (waits.length === 0 && !files[file]) continue;
    fixedWaitHits.push(...waits);

    const budget = ensure(file);
    budget.fixedWaitCalls = waits.length;
    budget.fixedWaitMs = waits.reduce((sum, w) => sum + w.ms, 0);
  }

  // 전 항목 0 인 파일은 기준선에 싣지 않는다 (깨끗한 파일까지 나열하면 diff 가 무의미해진다).
  for (const [file, budget] of Object.entries(files)) {
    const empty =
      budget.tolerantBranch === 0 &&
      budget.vacuousAssertion === 0 &&
      budget.fixedWaitCalls === 0 &&
      budget.fixedWaitMs === 0;
    if (empty) delete files[file];
  }

  return {
    files,
    onDisk: new Set([...specFiles, ...allFiles]),
    noAssertion,
    skips,
    tolerantHits,
    vacuousHits,
    fixedWaitHits,
  };
}

// ============================================================================
// 기준선 입출력
// ============================================================================

const BASELINE_COMMENT = [
  'E2E 게이트 기준선 — scripts/check-e2e-assertions.ts 가 읽는다.',
  '단조 감소 래칫이다. 숫자를 "올려서" 통과시키는 것을 금지한다 (ci-cd.yml 의 knip/eslint 예산과 같은 규칙).',
  '고쳐서 숫자가 내려가면 `pnpm exec tsx scripts/check-e2e-assertions.ts --update` 로 이 파일도 함께 낮춰야 통과한다.',
  '기준선에 없는 파일의 예산은 0 이다 — 새 스펙은 위반을 하나도 못 만든다. 그것이 이 게이트의 핵심 가치다.',
  'noAssertionAllowlist 는 단언 없이 통과 중인 기존 테스트의 유예 목록이다. 새 항목 추가 금지.',
  '측정하지 않는 영역: "관측 조건 if 안에 갇힌 expect"(약 52건). 문법은 멀쩡하지만 요소를 못 찾으면 실행되지 않아 결과는 공허한 단언과 같다. 예산이 0 이 되어도 이 영역은 남는다.',
];

function loadBaseline(): Baseline {
  try {
    const raw = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    return {
      $comment: raw.$comment ?? BASELINE_COMMENT,
      noAssertionAllowlist: raw.noAssertionAllowlist ?? [],
      files: raw.files ?? {},
    };
  } catch {
    return { $comment: BASELINE_COMMENT, noAssertionAllowlist: [], files: {} };
  }
}

function writeBaseline(measurement: Measurement): void {
  const sortedFiles: Record<string, FileBudget> = {};
  for (const key of Object.keys(measurement.files).sort()) {
    sortedFiles[key] = measurement.files[key]!;
  }

  const baseline: Baseline = {
    $comment: BASELINE_COMMENT,
    noAssertionAllowlist: measurement.noAssertion.map((o) => o.key).sort(),
    files: sortedFiles,
  };

  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log(`[e2e-gate] 기준선 갱신: ${relative(REPO_ROOT, BASELINE_PATH)}`);
}

// ============================================================================
// 실행
// ============================================================================

const RULE_LABELS: Record<keyof FileBudget, string> = {
  tolerantBranch: '관용 분기',
  vacuousAssertion: '공허한 단언',
  fixedWaitCalls: '고정 대기 호출',
  fixedWaitMs: '고정 대기 총 ms',
};

/**
 * 남은 위반을 파일:줄 단위로 전부 찍는다.
 *
 * 평소 게이트는 **예산을 넘긴 것만** 자세히 보여 준다. 그건 CI 에 맞는 동작이지만,
 * 남은 유예를 실제로 갚으려 할 때는 "지금 무엇이 어디에 남아 있는지" 목록이 필요하다.
 * 기준선을 임시로 0 으로 바꿔 보는 편법을 쓰지 않도록 조회 전용 모드를 둔다.
 */
function report(measurement: Measurement): void {
  const sections: Array<[string, RuleHit[]]> = [
    ['관용 분기', measurement.tolerantHits],
    ['공허 단언', measurement.vacuousHits],
    ['고정 대기', measurement.fixedWaitHits],
  ];

  for (const [label, hits] of sections) {
    console.log(`\n[${label}] ${hits.length}건`);
    for (const hit of [...hits].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      console.log(`  ${hit.file}:${hit.line}  ${hit.detail}`);
    }
  }

  console.log(`\n[무단언] ${measurement.noAssertion.length}건`);
  for (const offender of measurement.noAssertion) {
    console.log(`  ${offender.file}:${offender.line}  ${offender.title}`);
  }
}

function main(): void {
  const update = process.argv.includes('--update');
  const measurement = measure();

  if (process.argv.includes('--report')) {
    summarize(measurement);
    report(measurement);
    return;
  }

  if (update) {
    writeBaseline(measurement);
    summarize(measurement);
    return;
  }

  const baseline = loadBaseline();
  const errors: string[] = [];
  const regressions: string[] = [];
  const improvements: string[] = [];

  // ── R0: 단언 없는 테스트 ──────────────────────────────────────────────
  const allowed = new Set(baseline.noAssertionAllowlist);
  const newOffenders = measurement.noAssertion.filter((o) => !allowed.has(o.key));
  const staleAllowlist = [...allowed].filter(
    (key) => !measurement.noAssertion.some((o) => o.key === key)
  );

  if (newOffenders.length > 0) {
    errors.push(
      `단언(expect) 없는 테스트 ${newOffenders.length}건:\n` +
        newOffenders.map((o) => `    ${o.file}:${o.line}  ${o.title}`).join('\n') +
        '\n  단언 없는 테스트는 통제가 사라져도 통과한다.\n' +
        '    - 검증할 것이 있으면 `await expect(...)` 를 쓸 것\n' +
        '    - 미구현 기능이면 `test.fixme(...)` 로 명시할 것 (통과로 위장하지 말 것)'
    );
  }
  if (staleAllowlist.length > 0) {
    improvements.push(
      `noAssertionAllowlist 에 남은 유예 ${staleAllowlist.length}건이 이미 해소되었다:\n` +
        staleAllowlist.map((k) => `    ${k}`).join('\n')
    );
  }

  // ── S: 조건 없는 skip ────────────────────────────────────────────────
  if (measurement.skips.length > 0) {
    errors.push(
      `무조건 스킵 ${measurement.skips.length}건:\n` +
        measurement.skips.map((s) => `    ${s.file}:${s.line}  ${s.detail}`).join('\n') +
        '\n  조건 없이 건너뛰는 테스트는 화면이 통째로 망가져도 초록불이다.\n' +
        '    - 있어야 정상인 요소면 스킵을 지우고 `await expect(...).toBeVisible()` 로 실패하게 둘 것\n' +
        '    - 없어야 정상이면 `await expect(...).toBeHidden()` 으로 그것을 단언할 것\n' +
        '    - 미구현 기능이면 `test.fixme(...)` 로 명시할 것\n' +
        '    - 앞 단계 실패를 이어받는 가드라면 `if (조건) test.skip(true, 사유)` 로 조건을 드러낼 것'
    );
  }

  // ── R1~R3: 파일별 예산 ───────────────────────────────────────────────
  const hitsByRule: Record<keyof FileBudget, RuleHit[]> = {
    tolerantBranch: measurement.tolerantHits,
    vacuousAssertion: measurement.vacuousHits,
    fixedWaitCalls: measurement.fixedWaitHits,
    fixedWaitMs: measurement.fixedWaitHits,
  };

  const allKeys = new Set([...Object.keys(baseline.files), ...Object.keys(measurement.files)]);
  const deletedFiles: string[] = [];

  for (const file of [...allKeys].sort()) {
    const budget = baseline.files[file];

    // 기준선에 있는데 파일 자체가 사라졌다 — 예산 항목도 함께 지워야 한다.
    // (파일은 그대로인데 위반이 0 이 된 경우는 아래 일반 경로에서 "좋아졌다" 로 처리된다.)
    if (budget && !measurement.onDisk.has(file)) {
      deletedFiles.push(file);
      continue;
    }

    const current = measurement.files[file] ?? EMPTY_BUDGET;
    const allowance = budget ?? EMPTY_BUDGET;

    for (const rule of Object.keys(RULE_LABELS) as (keyof FileBudget)[]) {
      const now = current[rule];
      const max = allowance[rule];
      if (now > max) {
        const detail = hitsByRule[rule]
          .filter((h) => h.file === file)
          .map((h) => `      ${h.file}:${h.line}  ${h.detail}`)
          .join('\n');
        regressions.push(
          `    ${file} — ${RULE_LABELS[rule]} ${max} → ${now} (예산 초과)\n${detail}`
        );
      } else if (now < max) {
        improvements.push(`    ${file} — ${RULE_LABELS[rule]} ${max} → ${now}`);
      }
    }
  }

  if (deletedFiles.length > 0) {
    improvements.push(
      `기준선에 있으나 디스크에 없는 파일 ${deletedFiles.length}건 (삭제되었다면 예산 항목도 지울 것):\n` +
        deletedFiles.map((f) => `    ${f}`).join('\n')
    );
  }

  if (regressions.length > 0) {
    errors.push(
      `파일별 예산 초과 ${regressions.length}건:\n${regressions.join('\n')}\n` +
        '  이 게이트는 단조 감소 래칫이다. 예산을 올려서 통과시키지 말 것.\n' +
        '  고정 대기에 정당한 사유가 있다면 바로 윗줄에 `// allow-fixed-wait -- <사유>` 를 달 것.'
    );
  }

  summarize(measurement);

  if (errors.length === 0 && improvements.length === 0) {
    console.log('[e2e-gate] OK — 기준선과 정확히 일치한다.');
    return;
  }

  for (const err of errors) console.error(`\n[e2e-gate] ${err}`);

  if (improvements.length > 0) {
    console.error(
      `\n[e2e-gate] 기준선보다 좋아졌다 (${improvements.length}건). 기준선을 함께 낮춰야 한다:\n` +
        improvements.join('\n') +
        '\n\n  실행: pnpm exec tsx scripts/check-e2e-assertions.ts --update\n' +
        '  (감소분이 diff 에 남아야 개선이 기록된다. 이 마찰이 래칫의 본체다.)'
    );
  }

  process.exit(1);
}

function summarize(m: Measurement): void {
  const specCount = listFiles(E2E_DIR, E2E_DIR, '.spec.ts').length;
  const totals = Object.values(m.files).reduce(
    (acc, b) => ({
      tolerantBranch: acc.tolerantBranch + b.tolerantBranch,
      vacuousAssertion: acc.vacuousAssertion + b.vacuousAssertion,
      fixedWaitCalls: acc.fixedWaitCalls + b.fixedWaitCalls,
      fixedWaitMs: acc.fixedWaitMs + b.fixedWaitMs,
    }),
    { ...EMPTY_BUDGET }
  );

  console.log(
    `[e2e-gate] 스펙 ${specCount}개 검사 — ` +
      `무단언 ${m.noAssertion.length} · 관용분기 ${totals.tolerantBranch} · ` +
      `공허단언 ${totals.vacuousAssertion} · 고정대기 ${totals.fixedWaitCalls}회/${totals.fixedWaitMs}ms`
  );
}

main();
