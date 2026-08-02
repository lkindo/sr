// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * 감사 3.4 회귀 테스트 — 부트스트랩 경로.
 *
 * 깨끗한 DB 로 배포하면 마이그레이션은 성공하고 앱도 정상 부팅하지만, 역할·권한 행이
 * 하나도 없어 **아무도 로그인할 수 없고** `/register` 도 "시스템 설정 오류"로 실패했다.
 * 인스턴스가 영구히 사용 불가 상태가 되는데 문서화된 복구 절차조차 없었다.
 *
 * 이 테스트는 DB 없이 검증 가능한 두 층을 확인한다.
 *   1. 시드가 러너 이미지에서 실행 가능한 단일 JS 로 번들되는가
 *      (러너에는 tsx 도 devDependencies 도 없다)
 *   2. entrypoint 가 그 번들을 실제로 호출하는가
 *
 * 부트스트랩 로직의 동작(멱등성·가드)은 `prisma/seed.ts` 를 읽어 계약으로 확인한다.
 */

const REPO_ROOT = join(__dirname, '..', '..');
let bundleDir: string;
let bundlePath: string;

beforeAll(() => {
  bundleDir = mkdtempSync(join(tmpdir(), 'seed-bundle-'));
  bundlePath = join(bundleDir, 'seed.bundle.cjs');

  // Dockerfile 이 빌더 스테이지에서 실행하는 것과 동일한 명령.
  execFileSync(
    'node',
    [
      join(REPO_ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild'),
      join(REPO_ROOT, 'prisma', 'seed.ts'),
      '--bundle',
      '--platform=node',
      '--target=node22',
      '--format=cjs',
      '--external:@prisma/client',
      '--external:dotenv',
      `--outfile=${bundlePath}`,
    ],
    { cwd: REPO_ROOT, stdio: 'pipe' }
  );
}, 120_000);

afterAll(() => {
  if (bundleDir) rmSync(bundleDir, { recursive: true, force: true });
});

describe('시드 번들 (Dockerfile 빌더 스테이지)', () => {
  it('러너에서 node 만으로 실행 가능한 단일 파일로 번들된다', () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it('번들이 CommonJS 로 파싱된다 (node 가 실행할 수 있다)', () => {
    const source = readFileSync(bundlePath, 'utf8');
    // 최상위 import/export 가 남아 있으면 require 시점에 SyntaxError 가 난다.
    expect(source).not.toMatch(/^\s*import\s+[\w{*]/m);
    expect(() => new Function(source)).not.toThrow();
  });

  it('기준 데이터 시딩과 부트스트랩이 모두 포함된다', () => {
    const source = readFileSync(bundlePath, 'utf8');
    expect(source).toContain('seedReferenceData');
    expect(source).toContain('bootstrapAdmin');
  });

  it('개발용 픽스처 가드가 번들에 남아 있다', () => {
    // 이 가드가 사라지면 프로덕션에 테스트 계정이 생성된다(감사 3.2 재발).
    const source = readFileSync(bundlePath, 'utf8');
    expect(source).toContain('SEED_DEV_FIXTURES');
  });
});

describe('docker-entrypoint.sh', () => {
  const entrypoint = readFileSync(join(REPO_ROOT, 'docker-entrypoint.sh'), 'utf8');

  it('마이그레이션 이후에 시드를 실행한다', () => {
    const migrateAt = entrypoint.indexOf('prisma migrate deploy');
    const seedAt = entrypoint.indexOf('seed.bundle.cjs');

    expect(migrateAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(-1);
    // 역할·권한 테이블이 존재해야 시딩할 수 있다.
    expect(seedAt).toBeGreaterThan(migrateAt);
  });

  it('시드를 node 로 실행한다 (러너에 tsx 가 없다)', () => {
    expect(entrypoint).toMatch(/node\s+prisma\/seed\.bundle\.cjs/);
  });

  it('시딩 실패가 부팅을 막지 않는다', () => {
    // DB 일시 오류로 앱 전체가 뜨지 못하는 쪽이 더 나쁘다.
    expect(entrypoint).toMatch(/seed\.bundle\.cjs\s*\|\|/);
  });

  it('시드 실행 후 메인 프로세스를 exec 한다', () => {
    expect(entrypoint.indexOf('exec "$@"')).toBeGreaterThan(entrypoint.indexOf('seed.bundle.cjs'));
  });
});

describe('bootstrapAdmin 계약 (prisma/seed.ts)', () => {
  const seedSource = readFileSync(join(REPO_ROOT, 'prisma', 'seed.ts'), 'utf8');
  const fn = seedSource.slice(
    seedSource.indexOf('async function bootstrapAdmin'),
    seedSource.indexOf('async function main')
  );

  it('두 env 가 모두 있어야 동작한다', () => {
    expect(fn).toContain('BOOTSTRAP_ADMIN_EMAIL');
    expect(fn).toContain('BOOTSTRAP_ADMIN_PASSWORD');
    expect(fn).toMatch(/if\s*\(!email\s*\|\|\s*!password\)\s*return/);
  });

  it('ADMIN 이 이미 있으면 아무것도 하지 않는다 (멱등)', () => {
    expect(fn).toContain('existingAdminCount');
    expect(fn).toMatch(/existingAdminCount\s*>\s*0/);
  });

  it('기존 사용자의 비밀번호를 덮어쓰지 않는다', () => {
    // 운영자가 바꿔 둔 비밀번호를 되돌리면 3.2 와 같은 사고가 된다.
    const existingBranch = fn.slice(fn.indexOf('if (existingUser)'));
    expect(existingBranch).toContain('userRole.create');
    expect(existingBranch.slice(0, existingBranch.indexOf('return'))).not.toContain('password:');
  });

  it('짧은 비밀번호를 거부한다', () => {
    expect(fn).toMatch(/password\.length\s*<\s*12/);
  });

  it('비밀번호를 해싱해서 저장한다', () => {
    expect(fn).toMatch(/hash\(password,\s*BCRYPT_WORK_FACTOR\)/);
  });

  it('기준 데이터 시딩 이후에 호출된다 (ADMIN 역할이 존재해야 한다)', () => {
    const main = seedSource.slice(seedSource.indexOf('async function main'));
    expect(main.indexOf('bootstrapAdmin()')).toBeGreaterThan(main.indexOf('seedReferenceData()'));
  });
});
