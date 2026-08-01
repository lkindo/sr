/**
 * 통합(DB 기반) 테스트 셋업 (감사 3.37).
 *
 * `vitest.setup.ts` 와 **의도적으로 분리**되어 있다. 그쪽은 `DATABASE_URL` 을 가짜 값으로
 * 덮어쓰고 jsdom 을 쓰기 때문에, 그대로 쓰면 실제 Postgres 에 붙을 수 없다.
 *
 * 왜 필요한가: 기존 서비스 테스트는 전부 `$transaction: vi.fn((cb) => cb(mock))` 형태의
 * **패스스루 스텁**을 쓴다. 격리도 롤백도 에러 시맨틱도 없으므로
 *   - 부분 쓰기가 롤백되지 않는 트랜잭션
 *   - Prisma `where` 의 누락된 테넌트 필터
 *   - 동시 채번 경쟁
 * 세 부류는 구조적으로 감지할 수 없다. 이 프로젝트는 그 부분만 실제 DB 로 검증한다.
 */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll } from 'vitest';

/**
 * DB 없이 조용히 통과시키지 않는다.
 *
 * 기본값은 "반드시 실행". 건너뛰려면 `SKIP_DB_TESTS=true` 를 **명시**해야 한다.
 * 반대로 만들면(있을 때만 실행) CI 설정이 어긋났을 때 아무 테스트도 돌지 않으면서
 * 초록불이 되는데, 그게 정확히 이 감사 항목이 지적한 실패 방식이다.
 */
const skip = process.env.SKIP_DB_TESTS === 'true';

export const integrationPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

beforeAll(async () => {
  if (skip) {
    // eslint-disable-next-line no-console -- 테스트 러너 진단 출력. 건너뛴 사실이 반드시 보여야 한다.
    console.warn(
      '[integration] SKIP_DB_TESTS=true 로 DB 통합 테스트를 건너뜁니다. ' +
        'CI 에서는 절대 설정하지 마세요.'
    );
    return;
  }

  // `vitest.setup.ts` 의 플레이스홀더가 다시 새어 들어오면 즉시 알아채도록 막는다.
  // 이 값으로는 인증 실패만 반복되므로, 원인을 "DB 가 없다"로 오해하기 쉽다.
  if (process.env.DATABASE_URL?.includes('://test:test@localhost:5432/test')) {
    throw new Error(
      'DATABASE_URL 이 vitest.setup.ts 의 플레이스홀더입니다.\n' +
        '  루트 셋업이 실제 값을 덮어썼다는 뜻입니다(setupFiles 상속).\n' +
        '  vitest.setup.ts 는 DATABASE_URL 을 `??=` 로만 설정해야 합니다.'
    );
  }

  try {
    await integrationPrisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new Error(
      'DB 통합 테스트가 Postgres 에 연결하지 못했습니다.\n' +
        `  DATABASE_URL=${process.env.DATABASE_URL ?? '(미설정)'}\n` +
        '  로컬에서 DB 없이 돌리려면 SKIP_DB_TESTS=true 를 설정하세요.\n' +
        `  원인: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}, 60_000);

afterAll(async () => {
  await integrationPrisma.$disconnect();
});
