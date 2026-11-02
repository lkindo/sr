import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * 운영 앱의 설정 중 저장소가 정하는 값.
 * .env.docker 는 배포 때마다 시크릿에서 다시 쓰이므로, 시크릿 값보다 우선하는 것은 compose 의
 * environment 뿐이다. 이 줄이 빠지면 운영 한도가 시크릿의 옛 값(분당 20회)으로 조용히 돌아간다.
 */
describe('docker-compose.prod.yml', () => {
  const compose = parse(fs.readFileSync('docker-compose.prod.yml', 'utf8')) as {
    services: Record<string, { environment?: string[]; env_file?: string[] }>;
  };
  const app = Object.values(compose.services).find((service) =>
    service.env_file?.includes('.env.docker')
  );

  it('앱 서비스의 미들웨어 한도는 분당 100회다', () => {
    expect(app?.environment).toContain('RATE_LIMIT_MIDDLEWARE_MAX_REQUESTS=100');
  });
});
