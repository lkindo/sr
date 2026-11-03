import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * 앱 이미지 정리 스크립트를 실제로 실행한다. docker 만 대역으로 바꾼다.
 * 대역은 호출을 기록할 뿐 이미지를 지우지 않으므로, 판정은 `docker rmi` 호출로 한다.
 */
const FAKE_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case "$1" in
  ps) cat "$FAKE_CONTAINERS" ;;
  inspect) echo "$4" ;;
  images) cat "$FAKE_IMAGES" ;;
  rmi) [ -z "\${FAKE_RMI_FAIL:-}" ] || exit 1 ;;
esac
`;

const REPO = 'ghcr.io/lkindo/sr';

let root: string;
let log: string;
let imagesFile: string;
let containersFile: string;

function run(images: string[], containers: string[], args: string[] = [], env = {}) {
  fs.writeFileSync(imagesFile, images.map((line) => `${line}\n`).join(''));
  fs.writeFileSync(containersFile, containers.map((line) => `${line}\n`).join(''));
  const source = fs
    .readFileSync(path.join('scripts', 'prune-app-images.sh'), 'utf8')
    .replace(/\r\n/g, '\n');
  const target = path.join(root, 'prune-app-images.sh');
  fs.writeFileSync(target, source);

  return spawnSync('bash', [target, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
      FAKE_LOG: log,
      FAKE_IMAGES: imagesFile,
      FAKE_CONTAINERS: containersFile,
      ...env,
    },
  });
}

function calls(): string[] {
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
}

function removedTags(): string[] {
  return calls()
    .filter((line) => line.startsWith('docker rmi '))
    .map((line) => line.replace(`docker rmi ${REPO}:`, ''))
    .sort();
}

const image = (day: number, id: string, tag: string) =>
  `2026-11-0${day} 10:00:00 +0900 KST\t${id}\t${tag}`;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-images-'));
  log = path.join(root, 'calls.log');
  imagesFile = path.join(root, 'images.txt');
  containersFile = path.join(root, 'containers.txt');
  fs.mkdirSync(path.join(root, 'bin'));
  fs.writeFileSync(path.join(root, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('prune-app-images.sh', () => {
  it('최근 2개만 남기고 더 오래된 앱 이미지의 태그를 뗀다', () => {
    const result = run(
      [
        image(1, 'sha256:a', 'sha-a'),
        image(4, 'sha256:d', 'sha-d'),
        image(2, 'sha256:b', 'sha-b'),
        image(3, 'sha256:c', 'sha-c'),
      ],
      []
    );

    expect(result.status).toBe(0);
    expect(removedTags()).toEqual(['sha-a', 'sha-b']);
  });

  it('보존 개수를 인자로 바꿀 수 있다', () => {
    run(
      [image(1, 'sha256:a', 'sha-a'), image(2, 'sha256:b', 'sha-b'), image(3, 'sha256:c', 'sha-c')],
      [],
      ['1']
    );

    expect(removedTags()).toEqual(['sha-a', 'sha-b']);
  });

  it('오래됐어도 컨테이너가 쓰는 이미지는 지우지 않는다', () => {
    run(
      [
        image(1, 'sha256:a', 'sha-a'),
        image(2, 'sha256:b', 'sha-b'),
        image(3, 'sha256:c', 'sha-c'),
        image(4, 'sha256:d', 'sha-d'),
      ],
      ['sha256:a']
    );

    expect(removedTags()).toEqual(['sha-b']);
  });

  it('이동 태그 dev 는 개수에 넣지 않고 지우지도 않는다', () => {
    run(
      [
        image(5, 'sha256:dev', 'dev'),
        image(1, 'sha256:a', 'sha-a'),
        image(2, 'sha256:b', 'sha-b'),
        image(3, 'sha256:c', 'sha-c'),
      ],
      []
    );

    expect(removedTags()).toEqual(['sha-a']);
  });

  it('한 이미지에 붙은 태그를 모두 떼고, 같은 이미지를 두 개로 세지 않는다', () => {
    run(
      [
        image(1, 'sha256:a', 'sha-a'),
        image(1, 'sha256:a', 'rollback'),
        image(3, 'sha256:c', 'sha-c'),
        image(3, 'sha256:c', 'latest'),
        image(2, 'sha256:b', 'sha-b'),
      ],
      []
    );

    expect(removedTags()).toEqual(['rollback', 'sha-a']);
  });

  it('태그 없는 이미지만 정리한다(-a 를 쓰지 않아 certbot 같은 다른 이미지를 지우지 않는다)', () => {
    run([image(1, 'sha256:a', 'sha-a')], []);

    const pruneCalls = calls().filter((line) => line.includes('prune'));
    expect(pruneCalls).toEqual(['docker image prune -f']);
  });

  it.each(['0', 'abc', '-1'])('보존 개수 %s 는 아무것도 지우지 않고 거부한다', (keep) => {
    const result = run([image(1, 'sha256:a', 'sha-a')], [], [keep]);

    expect(result.status).toBe(2);
    expect(calls()).toEqual([]);
  });

  it('태그 삭제가 실패하면 실패로 끝난다', () => {
    const result = run(
      [image(1, 'sha256:a', 'sha-a'), image(2, 'sha256:b', 'sha-b'), image(3, 'sha256:c', 'sha-c')],
      [],
      [],
      { FAKE_RMI_FAIL: '1' }
    );

    expect(result.status).not.toBe(0);
  });
});

describe('deploy.yml 의 이미지 정리 배선', () => {
  const deploy = fs.readFileSync(path.join('.github', 'workflows', 'deploy.yml'), 'utf8');

  it('시간 기준 prune 으로 되돌아가지 않는다', () => {
    expect(deploy).not.toMatch(/^\s*docker image prune -af/m);
  });

  it('스크립트를 서버로 복사한다', () => {
    const workflow = parse(deploy) as {
      jobs: Record<string, { steps: { name?: string; with?: { source?: string } }[] }>;
    };
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
    const copy = steps.find((step) => step.name === 'Copy Config Files to Remote VM');
    expect(copy?.with?.source?.split(',')).toContain('scripts/prune-app-images.sh');
  });

  it('운영과 스테이징 양쪽 배포에서 2개 보존으로 부른다', () => {
    const invocations = deploy.match(/bash scripts\/prune-app-images\.sh 2 /g) ?? [];
    expect(invocations).toHaveLength(2);
  });
});
