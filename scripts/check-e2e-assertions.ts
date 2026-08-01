/**
 * 단언 없는 E2E 테스트를 찾아내는 게이트 (감사 3.34).
 *
 * 배경: 보안·권한상승 E2E 가 `expect` 대신 `console.log` 로 결과를 "확인"하고 있었다.
 * 그런 테스트는 **통제가 완전히 사라져도 초록불**이라, 있으나 마나 한 정도가 아니라
 * 회귀를 못 잡으면서 잡고 있다고 착각하게 만든다.
 *
 * 이 스크립트는 각 `test(...)` 본문에 `expect(` 호출이 하나라도 있는지 AST 로 검사한다.
 * 정규식이 아니라 컴파일러 API 를 쓰는 이유는 주석·문자열 안의 'expect' 를 세지 않기 위해서다.
 *
 * 의도적으로 단언이 없는 테스트는 `test.fixme` / `test.skip` 으로 **명시**해야 한다.
 * 미구현 기능을 "통과"로 위장하지 말고 미구현이라고 적으라는 것이 이 게이트의 요지다.
 *
 * **이 검사가 잡지 못하는 것:** `expect(x).toBeGreaterThanOrEqual(0)` 같은 항상-참 단언은
 * 단언이 "있으므로" 통과한다. 그런 공허한 단언은 감사 5절의 별도 항목이며 사람 리뷰가 필요하다.
 * 여기서 막는 것은 "단언이 아예 없는 테스트"라는, 기계적으로 확실한 부분집합이다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/check-e2e-assertions.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const REPO_ROOT = join(__dirname, '..');
const E2E_DIR = join(REPO_ROOT, 'e2e');

interface Offender {
  file: string;
  line: number;
  title: string;
}

function listSpecFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSpecFiles(full, base));
    } else if (entry.endsWith('.spec.ts')) {
      out.push(relative(base, full));
    }
  }
  return out;
}

/** `test(...)` / `it(...)` 호출인가? `test.skip`/`test.fixme` 는 의도적 제외로 본다. */
function classifyCall(node: ts.CallExpression): 'test' | 'exempt' | null {
  const callee = node.expression;

  if (ts.isIdentifier(callee)) {
    return callee.text === 'test' || callee.text === 'it' ? 'test' : null;
  }

  if (ts.isPropertyAccessExpression(callee)) {
    const root = callee.expression;
    if (!ts.isIdentifier(root) || (root.text !== 'test' && root.text !== 'it')) return null;

    const prop = callee.name.text;
    // 명시적으로 "지금은 안 돈다"고 선언한 것은 게이트 대상이 아니다.
    if (prop === 'skip' || prop === 'fixme' || prop === 'describe') return 'exempt';
    if (prop === 'only') return 'test';
    return null;
  }

  return null;
}

function hasExpectCall(body: ts.Node): boolean {
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

function findOffenders(file: string): Offender[] {
  const fullPath = join(E2E_DIR, file);
  const source = readFileSync(fullPath, 'utf8');
  const sf = ts.createSourceFile(fullPath, source, ts.ScriptTarget.Latest, true);
  const offenders: Offender[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const kind = classifyCall(node);
      if (kind === 'exempt') return; // 하위 트리까지 건너뛴다
      if (kind === 'test') {
        const [titleArg, bodyArg] = node.arguments;
        const body = bodyArg ?? node.arguments[node.arguments.length - 1];
        if (body && !hasExpectCall(body)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          const title =
            titleArg && ts.isStringLiteralLike(titleArg) ? titleArg.text : '(제목 불명)';
          offenders.push({ file, line: line + 1, title });
        }
        return;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return offenders;
}

function main() {
  const specs = listSpecFiles(E2E_DIR).sort();

  // 전체 스펙을 게이트한다. 도입 시점에 34개 전부가 통과하므로 범위를 좁힐 이유가 없고,
  // 좁히면 그 밖에서 단언 없는 테스트가 새로 생겨도 잡지 못한다.
  const offenders = specs.flatMap(findOffenders);

  console.log(`[e2e-assertions] 스펙 ${specs.length}개 검사`);

  if (offenders.length === 0) {
    console.log('[e2e-assertions] OK — 단언 없는 테스트가 없다.');
    return;
  }

  console.error(`\n[e2e-assertions] 단언(expect) 없는 테스트 ${offenders.length}건:`);
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  ${o.title}`);
  }
  console.error(
    '\n단언 없는 테스트는 통제가 사라져도 통과한다.\n' +
      '  - 검증할 것이 있으면 `await expect(...)` 를 쓸 것\n' +
      '  - 미구현 기능이면 `test.fixme(...)` 로 명시할 것 (통과로 위장하지 말 것)'
  );

  process.exit(1);
}

main();
