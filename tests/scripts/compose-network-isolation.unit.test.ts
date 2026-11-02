import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * test 스택과 운영 스택의 네트워크 격리를 고정한다.
 *
 * 둘은 한 서버에 있다. 같은 네트워크를 쓰면 스테이징 이미지가 운영 db:5432 와 app:3000 에
 * 직접 닿고, nginx 를 거치지 않으므로 X-Real-IP 까지 위조할 수 있다. 공유 네트워크로
 * 되돌려도 compose 문법과 이미지 스모크는 그대로 통과하므로 여기서 잡는다.
 */
const TEST_NETWORK = 'sr_test_net';
const PROD_NETWORK = 'sr_sr-net';
const NETWORK_MTU = '1400';

interface ComposeNetwork {
  external?: boolean;
  name?: string;
  driver_opts?: Record<string, string | number>;
}

interface ComposeFile {
  services: Record<string, { networks?: string[] }>;
  networks?: Record<string, ComposeNetwork>;
}

function readRepoFile(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

function readCompose(file: string): ComposeFile {
  return parse(readRepoFile(file)) as ComposeFile;
}

/** compose 안의 키가 아니라 도커에 실제로 생기는 네트워크 이름으로 푼다. */
function dockerNetworksOf(compose: ComposeFile, service: string, project: string): string[] {
  const keys = compose.services[service]?.networks ?? [];
  return keys.map((key) => compose.networks?.[key]?.name ?? `${project}_${key}`).sort();
}

const testStack = readCompose('docker-compose.test.yml');
const prodStack = readCompose('docker-compose.prod.yml');

describe('test 스택 네트워크 격리', () => {
  it.each(Object.keys(testStack.services))('test 의 %s 는 전용 네트워크에만 붙는다', (service) => {
    expect(dockerNetworksOf(testStack, service, 'sr-test')).toEqual([TEST_NETWORK]);
  });

  it.each(Object.keys(prodStack.services).filter((service) => service !== 'nginx'))(
    '운영의 %s 는 test 네트워크에 붙지 않는다',
    (service) => {
      expect(dockerNetworksOf(prodStack, service, 'sr')).toEqual([PROD_NETWORK]);
    }
  );

  it('nginx 만 두 네트워크에 함께 붙는다', () => {
    expect(dockerNetworksOf(prodStack, 'nginx', 'sr')).toEqual([PROD_NETWORK, TEST_NETWORK].sort());
  });

  it('두 compose 모두 test 네트워크를 외부 네트워크로 쓴다', () => {
    for (const compose of [testStack, prodStack]) {
      const network = Object.values(compose.networks ?? {}).find((n) => n.name === TEST_NETWORK);
      expect(network?.external).toBe(true);
    }
  });

  it('배포는 compose 를 쓰기 전에 운영과 같은 MTU 로 네트워크를 만든다', () => {
    const prodMtu = prodStack.networks?.['sr-net']?.driver_opts?.['com.docker.network.driver.mtu'];
    expect(String(prodMtu)).toBe(NETWORK_MTU);

    const deploy = readRepoFile('.github/workflows/deploy.yml');
    const create = deploy.indexOf(
      `docker network create --opt com.docker.network.driver.mtu=${NETWORK_MTU} ${TEST_NETWORK}`
    );
    const firstComposeUse = deploy.indexOf('docker compose $COMPOSE_ARGS');

    expect(create).toBeGreaterThan(-1);
    expect(firstComposeUse).toBeGreaterThan(create);
  });
});
