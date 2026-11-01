import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 모든 화면의 초기 JS 를 늘리는 import 를 막는다.
 *
 * 이 경로들은 동작을 바꾸지 않아서 기능 테스트로는 드러나지 않는다. 실제로 UI 배럴 하나 때문에
 * 달력과 Radix 전부가 로그인 화면까지 실렸고, 숫자 상수 몇 개 때문에 zod 가 실렸다.
 * 접수 폼(`use-intake-form`)은 zod 를 실제로 쓰므로 'use client' 파일이 아니라 훅에서 가져온다.
 *
 * 직접 import 만 본다. 클라이언트 파일이 가져온 일반 모듈의 하위 의존성까지 추적하지는 않는다.
 * 문자열 대신 AST 로 판별해 선행 주석이나 따옴표 종류로 검사를 빠져나가지 못하게 한다.
 */
const SRC_ROOT = path.join(process.cwd(), 'src');
const FORBIDDEN_IN_CLIENT = ['@prisma/client', '@/lib/schemas', 'zod'];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function statementsOf(source: string): readonly ts.Statement[] {
  return ts.createSourceFile('file.tsx', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
    .statements;
}

/** 지시문은 파일 맨 앞에 이어지는 문자열 문장이다. 주석은 문장이 아니므로 영향을 주지 않는다. */
function isClientModule(source: string): boolean {
  for (const statement of statementsOf(source)) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === 'use client') return true;
  }
  return false;
}

/** 컴파일에서 사라지는 import. `import type` 과 전부 `type` 인 이름 목록이다. */
function isErasedImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const names = clause.namedBindings;
  return (
    !clause.name &&
    names !== undefined &&
    ts.isNamedImports(names) &&
    names.elements.length > 0 &&
    names.elements.every((element) => element.isTypeOnly)
  );
}

/** 번들에 실제로 들어가는 모듈 경로. 재수출도 포함한다. */
function valueModulesOf(source: string): string[] {
  return statementsOf(source).flatMap((statement) => {
    if (ts.isImportDeclaration(statement) && !isErasedImport(statement)) {
      return [(statement.moduleSpecifier as ts.StringLiteral).text];
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      return [(statement.moduleSpecifier as ts.StringLiteral).text];
    }
    return [];
  });
}

const relative = (file: string) => path.relative(process.cwd(), file).split(path.sep).join('/');

const clientFiles = sourceFiles(SRC_ROOT).filter((file) => isClientModule(read(file)));

describe('검사기 자체', () => {
  it.each([
    ['지시문만', `'use client';\nimport a from 'a';`],
    ['큰따옴표', `"use client";\nimport a from 'a';`],
    ['선행 한 줄 주석', `// 경로 주석\n'use client';\nimport a from 'a';`],
    ['선행 블록 주석', `/* 설명 */\n'use client';\nimport a from 'a';`],
    ['다른 지시문 뒤', `'use strict';\n'use client';\nimport a from 'a';`],
  ])('클라이언트 파일로 본다: %s', (_name, source) => {
    expect(isClientModule(source)).toBe(true);
  });

  it.each([
    ['지시문 없음', `import a from 'a';`],
    ['import 뒤의 문자열', `import a from 'a';\n'use client';`],
    ['주석 안의 지시문', `// 'use client';\nimport a from 'a';`],
  ])('클라이언트 파일로 보지 않는다: %s', (_name, source) => {
    expect(isClientModule(source)).toBe(false);
  });

  it.each([
    ['이름 import', `import { z } from 'zod';`],
    ['큰따옴표', `import { z } from "zod";`],
    ['여러 줄', `import {\n  z,\n} from 'zod';`],
    ['기본 import', `import z from 'zod';`],
    ['전체 import', `import * as z from 'zod';`],
    ['부수 효과 import', `import 'zod';`],
    ['type 과 값이 섞임', `import { type ZodType, z } from 'zod';`],
    ['재수출', `export { z } from 'zod';`],
  ])('값 import 로 본다: %s', (_name, source) => {
    expect(valueModulesOf(source)).toEqual(['zod']);
  });

  it.each([
    ['import type', `import type { z } from 'zod';`],
    ['전부 type 인 이름', `import { type z, type ZodType } from 'zod';`],
    ['export type', `export type { z } from 'zod';`],
  ])('값 import 로 보지 않는다: %s', (_name, source) => {
    expect(valueModulesOf(source)).toEqual([]);
  });
});

describe('클라이언트 번들 경계', () => {
  it('클라이언트 파일을 찾았다', () => {
    expect(clientFiles.length).toBeGreaterThan(50);
  });

  it('첫 줄에 주석이 있는 클라이언트 파일도 검사한다', () => {
    expect(clientFiles.map(relative)).toContain('src/app/(dashboard)/srs/[id]/page.tsx');
  });

  it('UI 폴더는 부수 효과가 없다고 선언한다', () => {
    const manifest = JSON.parse(read(path.join(SRC_ROOT, 'components/ui/package.json')));

    expect(manifest.sideEffects).toBe(false);
  });

  it.each(FORBIDDEN_IN_CLIENT)("'use client' 파일은 %s 를 값으로 가져오지 않는다", (module) => {
    const offenders = clientFiles.filter((file) => valueModulesOf(read(file)).includes(module));

    expect(offenders.map(relative)).toEqual([]);
  });

  it.each(['field-limits.ts', 'password-policy.ts'])('%s 는 zod 를 들이지 않는다', (file) => {
    expect(valueModulesOf(read(path.join(SRC_ROOT, 'lib', file)))).not.toContain('zod');
  });
});
