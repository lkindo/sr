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
  stop*) touch "$FAKE_LOG.stopped" ;;
  start*) rm -f "$FAKE_LOG.stopped" ;;
  *pg_dump*)
    printf 'partial-dump'
    [ -z "\${FAKE_DUMP_FAIL:-}" ] || exit 1
    ;;
  *'tar czf'*) printf 'fake-tar' ;;
  *'pg_restore -l'*|*'tar tzf'*) cat >/dev/null ;;
  *pg_restore*)
    [ -z "\${FAKE_RESTORE_FAIL:-}" ] || exit 1
    cat > "$FAKE_RESTORED"
    ;;
  *Health*) echo healthy ;;
  *State.Running*) if [ -f "$FAKE_LOG.stopped" ]; then echo false; else echo true; fi ;;
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
let tmp: string;

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
      TMPDIR: tmp,
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
  tmp = path.join(root, 'tmp');
  fs.mkdirSync(backupDir);
  fs.mkdirSync(tmp);
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

  // 훅 안의 앞선 명령이 실패해도 놓치면 안 된다.
  it('복제 명령 중간이 실패해도 실패로 끝낸다', () => {
    const result = run('backup.sh', [], { OFFSITE_CMD: 'false; true' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('로컬 백업은 보존했습니다');
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
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  it('복구가 실패해도 앱을 다시 올리고 복호화한 평문을 지운다', () => {
    const result = run('restore.sh', [dump()], {
      BACKUP_AGE_IDENTITY_FILE: 'id.key',
      FAKE_RESTORE_FAIL: '1',
    });

    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(log, 'utf8')).toContain('docker start sr-app');
    expect(fs.readdirSync(tmp)).toEqual([]);
  });

  // 사전 안전 백업이 평문이면 암호화 백업으로 복구하는 의미가 없다.
  it('사전 백업을 암호화할 수신자가 없으면 시작하지 않는다', () => {
    const result = run('restore.sh', [dump()], {
      BACKUP_AGE_IDENTITY_FILE: 'id.key',
      SKIP_PRE_RESTORE_BACKUP: '',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('BACKUP_ENCRYPT_RECIPIENT');
    expect(fs.readFileSync(log, 'utf8')).toBe('');
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
