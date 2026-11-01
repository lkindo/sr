import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * 백업·복구 스크립트를 실제로 실행한다. 바깥세상(docker, age)만 대역으로 바꾼다.
 * 스크립트는 저장소 줄바꿈과 무관하게 돌도록 LF 로 옮겨 실행한다(서버의 sed 와 같은 처리).
 */
const FAKE_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case "$*" in
  *pg_dump*)
    printf 'partial-dump'
    [ -z "\${FAKE_DUMP_FAIL:-}" ] || exit 1
    ;;
  *'tar czf'*) printf 'fake-tar' ;;
  *'pg_restore -l'*|*'tar tzf'*) cat >/dev/null ;;
  *pg_restore*) cat > "$FAKE_RESTORED" ;;
  *Health*) echo healthy ;;
  *State.Running*) echo true ;;
  *Config.Image*) echo fake-image ;;
esac
`;

// `age -d -i <key> -o <out> <in>` 만 흉내 낸다.
const FAKE_AGE = `#!/usr/bin/env bash
echo "age $*" >> "$FAKE_LOG"
cp "$6" "$5"
`;

let root: string;
let backupDir: string;
let log: string;
let restored: string;

function run(script: string, args: string[], env: Record<string, string> = {}) {
  const source = fs.readFileSync(path.join('scripts', script), 'utf8').replace(/\r\n/g, '\n');
  const target = path.join(root, script);
  fs.writeFileSync(target, source);

  return spawnSync('bash', [target, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
      POSTGRES_USER: 'tester',
      POSTGRES_DB: 'sr_db',
      BACKUP_DIR: backupDir,
      BACKUP_ENCRYPT_RECIPIENT: '',
      FAKE_LOG: log,
      FAKE_RESTORED: restored,
      FORCE: '1',
      SKIP_PRE_RESTORE_BACKUP: '1',
      ...env,
    },
  });
}

const backups = () => fs.readdirSync(backupDir);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-scripts-'));
  backupDir = path.join(root, 'backups');
  log = path.join(root, 'calls.log');
  restored = path.join(root, 'restored.bin');
  fs.mkdirSync(backupDir);
  fs.mkdirSync(path.join(root, 'bin'));
  fs.writeFileSync(log, '');
  fs.writeFileSync(path.join(root, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'bin', 'age'), FAKE_AGE, { mode: 0o755 });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('backup.sh', () => {
  it('오프호스트 복제가 실패해도 완성된 로컬 백업은 지우지 않고 실패로 끝낸다', () => {
    const result = run('backup.sh', [], { OFFSITE_CMD: 'false' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('로컬 백업은 보존했습니다');
    expect(backups().some((name) => name.startsWith('db_'))).toBe(true);
    expect(backups().some((name) => name.startsWith('uploads_'))).toBe(true);
  });

  it('덤프가 실패하면 부분 산출물을 남기지 않는다', () => {
    const result = run('backup.sh', [], { FAKE_DUMP_FAIL: '1' });

    expect(result.status).not.toBe(0);
    expect(backups()).toEqual([]);
  });

  it('복제까지 성공하면 정상 종료한다', () => {
    const result = run('backup.sh', [], { OFFSITE_CMD: 'true' });

    expect(result.status, result.stderr).toBe(0);
  });
});

describe('restore.sh', () => {
  const dump = () => path.join(backupDir, 'db_20260101_000000.dump.age');

  beforeEach(() => {
    fs.writeFileSync(dump(), 'plain-dump-after-decrypt');
  });

  it('암호화된 덤프를 복호화해 복구한다', () => {
    const result = run('restore.sh', [dump()], { BACKUP_AGE_IDENTITY_FILE: 'id.key' });

    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(log, 'utf8')).toContain('age -d -i id.key');
    expect(fs.readFileSync(restored, 'utf8')).toBe('plain-dump-after-decrypt');
  });

  it('복호화 키가 없으면 앱을 멈추지도 복구하지도 않는다', () => {
    const result = run('restore.sh', [dump()], { BACKUP_AGE_IDENTITY_FILE: '' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('BACKUP_AGE_IDENTITY_FILE');
    expect(fs.readFileSync(log, 'utf8')).toBe('');
  });

  it('평문 덤프는 그대로 복구한다', () => {
    const plain = path.join(backupDir, 'db_20260101_000000.dump');
    fs.writeFileSync(plain, 'plain-dump');

    const result = run('restore.sh', [plain]);

    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(restored, 'utf8')).toBe('plain-dump');
  });
});
