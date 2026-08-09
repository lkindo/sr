/**
 * 파괴적 DB 초기화 가드.
 *
 * ── 왜 있는가 ────────────────────────────────────────────────────────────
 * `helpers.ts` 의 `resetDatabase` 는 `DATABASE_URL` 이 가리키는 DB 에 users/clients/srs 를
 * 포함한 16개 테이블을 TRUNCATE 한다. 그런데 이 스위트는 기본값이 **실행**이고
 * (그 설계 자체는 옳다 — `describeDb` 주석 참조), 루트 `pnpm vitest run` 은 integration
 * 프로젝트까지 함께 돌린다. 즉 `.env` 가 개발 DB 를 가리키는 평범한 상태에서
 * **전체 테스트를 한 번 돌리면 개발 DB 가 비워진다.**
 *
 * 실제로 두 번 그렇게 날아갔다(2026-08-07, 2026-08-09). 남는 흔적이 팩토리가 만든
 * `user-<pid>-<n>@example.com` 픽스처 한 줌뿐이라, 원인을 모르면 "누가 DB 를 건드렸나"
 * 를 한참 뒤진다. 두 번째에는 시드 계정 5종이 사라져 E2E 전량과 앱 로그인이 함께 죽었다.
 *
 * ── 왜 "건너뛰기" 가 아니라 "실패" 인가 ──────────────────────────────────
 * DB 가 테스트용이 아니면 조용히 skip 하는 편이 편하지만, 그러면 CI 설정이 어긋났을 때
 * 아무것도 돌지 않으면서 초록불이 된다. 그게 감사 3.37 이 지적한 실패 방식 그 자체다.
 * 그래서 **크게 실패**시키고, 무엇을 하면 되는지 메시지에 적는다.
 *
 * 이 모듈은 **부수 효과가 없다.** DB 연결도 하지 않는다 — 그래야 가드 자신을
 * DB 없이 단위 테스트할 수 있다(db-guard.unit.test.ts).
 */

/**
 * 파괴적 초기화를 허용할 DB 이름.
 *
 * `sr_ci`(CI), `sr_db_test` 처럼 이름에 test/ci 가 **토큰으로** 들어간 것만 통과시킨다.
 * 토큰 경계를 요구하는 이유: `citation` 이나 `latest` 같은 이름이 우연히 통과하면
 * 가드가 있으나 마나다. `sr_db`(로컬 개발 DB)는 통과하지 못한다 — 그게 존재 이유다.
 */
const TEST_DATABASE_NAME = /(^|[_-])(test|ci)([_-]|$)/i;

/** DATABASE_URL 에서 DB 이름만 뽑는다. 파싱에 실패하면 빈 문자열(= 불합격). */
export function databaseNameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

/** 이 가드가 읽는 환경변수만 추린 형태. `process.env` 전체를 요구하지 않아야 테스트가 쉽다. */
export interface DbGuardEnv {
  DATABASE_URL?: string | undefined;
  ALLOW_DESTRUCTIVE_DB_RESET?: string | undefined;
  // 인덱스 시그니처가 있어야 `process.env`(NodeJS.ProcessEnv)를 그대로 넘길 수 있다.
  // 없으면 TS 의 weak type 검사가 "공통 속성이 없다" 며 거절한다.
  [key: string]: string | undefined;
}

/** 이 DB 를 비워도 되는가. 판단 근거는 이름뿐이다(연결하지 않는다). */
export function isDestructiveResetAllowed(url: string | undefined, env: DbGuardEnv = {}): boolean {
  if (env.ALLOW_DESTRUCTIVE_DB_RESET === 'true') return true;

  const name = databaseNameOf(url);
  return name !== '' && TEST_DATABASE_NAME.test(name);
}

/** 허용되지 않으면 던진다. 메시지는 다음에 무엇을 하면 되는지까지 적는다. */
export function assertDestructiveResetIsSafe(env: DbGuardEnv = process.env): void {
  if (isDestructiveResetAllowed(env.DATABASE_URL, env)) return;

  const name = databaseNameOf(env.DATABASE_URL);
  throw new Error(
    [
      `[통합 테스트] DATABASE_URL 이 테스트용 DB 가 아닙니다: "${name || '(미설정 또는 파싱 실패)'}"`,
      '',
      '이 스위트는 users/clients/srs 를 포함한 16개 테이블을 TRUNCATE 합니다.',
      '개발 DB 를 가리킨 채로 돌리면 시드 데이터가 사라집니다(실제로 두 번 사라졌습니다).',
      '',
      '다음 중 하나를 선택하세요:',
      '  1) 통합 테스트를 건너뛴다 — 유닛만 돌릴 때 권장',
      '       SKIP_DB_TESTS=true pnpm vitest run',
      '  2) 테스트 DB 를 가리킨다 (이름에 test 또는 ci 가 토큰으로 포함되어야 함)',
      '       DATABASE_URL="postgresql://.../sr_db_test?schema=public" pnpm test:integration',
      '     ⚠️ 준비 단계(prisma db push / db:seed)에는 이 방법이 통하지 않는다 —',
      '        Prisma CLI 는 셸 변수보다 .env 를 우선한다(--env-file 옵션도 없다).',
      '        테스트 DB 를 처음 만들 때는 .env 의 DATABASE_URL 을 잠시 바꿔서',
      '        `pnpm exec prisma db push` 와 `pnpm db:seed` 를 돌린 뒤 되돌린다.',
      '  3) 정말 지금 이 DB 를 비우려면 명시한다',
      '       ALLOW_DESTRUCTIVE_DB_RESET=true pnpm test:integration',
    ].join('\n')
  );
}
