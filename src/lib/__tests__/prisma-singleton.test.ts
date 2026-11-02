import { afterEach, describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({ count: 0 }));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      created.count += 1;
    }
    $extends() {
      return { $transaction: async () => undefined };
    }
  },
}));

describe('Prisma 클라이언트의 프로세스 전역 공유', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { prismaGlobal?: unknown }).prismaGlobal;
    created.count = 0;
  });

  it('운영 빌드에서 모듈 그래프가 달라도 연결 풀을 하나만 만든다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pw@localhost:5432/test');

    // `vi.resetModules()` 뒤의 재import 는 다른 그래프가 같은 파일을 평가한 상황과 같다.
    await import('../prisma');
    vi.resetModules();
    await import('../prisma');

    expect(created.count).toBe(1);
  });
});
