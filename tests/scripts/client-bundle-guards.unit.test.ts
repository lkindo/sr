import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 모든 화면의 초기 JS 를 늘리는 import 를 막는다.
 *
 * 이 경로들은 동작을 바꾸지 않아서 기능 테스트로는 드러나지 않는다. 실제로 UI 배럴 하나 때문에
 * 달력과 Radix 전부가 로그인 화면까지 실렸고, 숫자 상수 몇 개 때문에 zod 가 실렸다.
 * 접수 폼(`use-intake-form`)은 zod 를 실제로 쓰므로 'use client' 파일이 아니라 훅에서 가져온다.
 */
const SRC_ROOT = path.join(process.cwd(), 'src');

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

const relative = (file: string) => path.relative(process.cwd(), file).split(path.sep).join('/');

const clientFiles = sourceFiles(SRC_ROOT).filter((file) =>
  /^\s*['"]use client['"]/.test(read(file))
);

/** `import type` 는 컴파일에서 사라지므로 번들과 무관하다. */
const VALUE_IMPORT_OF = (module: string) =>
  new RegExp(`^import\\s+(?!type\\b)[^;]*?from\\s+'${module}'`, 'm');

describe('클라이언트 번들 경계', () => {
  it('클라이언트 파일을 찾았다', () => {
    expect(clientFiles.length).toBeGreaterThan(50);
  });

  it('UI 폴더는 부수 효과가 없다고 선언한다', () => {
    const manifest = JSON.parse(read(path.join(SRC_ROOT, 'components/ui/package.json')));

    expect(manifest.sideEffects).toBe(false);
  });

  it.each(['@prisma/client', '@/lib/schemas', 'zod'])(
    "'use client' 파일은 %s 를 값으로 가져오지 않는다",
    (module) => {
      const offenders = clientFiles.filter((file) => VALUE_IMPORT_OF(module).test(read(file)));

      expect(offenders.map(relative)).toEqual([]);
    }
  );

  it.each(['field-limits.ts', 'password-policy.ts'])('%s 는 zod 를 들이지 않는다', (file) => {
    expect(read(path.join(SRC_ROOT, 'lib', file))).not.toMatch(VALUE_IMPORT_OF('zod'));
  });
});
