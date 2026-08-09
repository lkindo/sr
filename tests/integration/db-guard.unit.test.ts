import { describe, expect, it } from 'vitest';

import {
  assertDestructiveResetIsSafe,
  databaseNameOf,
  isDestructiveResetAllowed,
} from './db-guard';

/**
 * 파괴적 DB 초기화 가드의 계약.
 *
 * ── 왜 `.unit.test.ts` 인가 ──────────────────────────────────────────────
 * 이 가드가 지키는 상황은 정확히 **테스트 DB 가 없는 환경**이다. 그러니 가드 자신의
 * 검증이 DB 를 요구하면 정작 필요한 곳에서 돌지 않는다. db-guard 는 부수 효과가 없는
 * 순수 모듈이라, 이 파일만 integration 프로젝트에서 빼고 unit 프로젝트가 집어간다
 * (vitest.config.ts 의 두 프로젝트 include/exclude 참조).
 *
 * ── 무엇을 고정하는가 ────────────────────────────────────────────────────
 * 이름 판정이 느슨해지면 개발 DB 가 다시 통과하고, 빡빡해지면 CI(`sr_ci`)가 막힌다.
 * 양쪽을 다 단언한다 — 한쪽만 두면 반대 방향 회귀를 못 잡는다.
 */

const URL_OF = (name: string) => `postgresql://u:p@127.0.0.1:5432/${name}?schema=public`;

describe('파괴적 DB 초기화 가드', () => {
  describe('허용되는 DB 이름', () => {
    // CI 가 실제로 쓰는 이름이다(.github/workflows/ci-cd.yml 의 DATABASE_URL).
    // 이게 막히면 CI 의 통합 테스트가 통째로 죽으므로 반드시 통과해야 한다.
    it.each(['sr_ci', 'sr_db_test', 'test', 'ci', 'test_db', 'ci-runner', 'app-test'])(
      '%s 는 비워도 된다',
      (name) => {
        expect(isDestructiveResetAllowed(URL_OF(name))).toBe(true);
      }
    );
  });

  describe('거부되는 DB 이름', () => {
    // 'sr_db' 가 이 목록의 이유다 — 실제로 두 번 비워진 개발 DB 다.
    // 나머지는 토큰 경계 없이 test/ci 를 포함해 "우연히 통과" 할 뻔한 이름들이다.
    it.each(['sr_db', 'production', 'citation', 'latest', 'contest', 'greatest', 'civic'])(
      '%s 는 막아야 한다',
      (name) => {
        expect(isDestructiveResetAllowed(URL_OF(name))).toBe(false);
      }
    );

    it('URL 이 없거나 깨졌으면 막는다 — 모르면 지우지 않는다', () => {
      expect(isDestructiveResetAllowed(undefined)).toBe(false);
      expect(isDestructiveResetAllowed('')).toBe(false);
      expect(isDestructiveResetAllowed('그냥 문자열')).toBe(false);
      expect(isDestructiveResetAllowed('postgresql://u:p@host:5432/')).toBe(false);
    });
  });

  describe('명시적 우회', () => {
    it('ALLOW_DESTRUCTIVE_DB_RESET=true 면 개발 DB 라도 통과한다', () => {
      expect(
        isDestructiveResetAllowed(URL_OF('sr_db'), { ALLOW_DESTRUCTIVE_DB_RESET: 'true' })
      ).toBe(true);
    });

    it("'true' 문자열이 아니면 우회가 아니다 — 오타로 열리면 안 된다", () => {
      for (const value of ['1', 'yes', 'TRUE', '']) {
        expect(
          isDestructiveResetAllowed(URL_OF('sr_db'), { ALLOW_DESTRUCTIVE_DB_RESET: value })
        ).toBe(false);
      }
    });
  });

  describe('databaseNameOf', () => {
    it('경로에서 DB 이름만 뽑는다', () => {
      expect(databaseNameOf(URL_OF('sr_db_test'))).toBe('sr_db_test');
      expect(databaseNameOf('postgresql://u:p@h:5432/plain')).toBe('plain');
    });

    it('퍼센트 인코딩된 이름도 읽는다', () => {
      expect(databaseNameOf('postgresql://u:p@h:5432/sr%5Ftest')).toBe('sr_test');
    });
  });

  describe('assertDestructiveResetIsSafe', () => {
    it('막힐 때 무엇을 하면 되는지 알려 준다', () => {
      // 메시지가 부실하면 다음 사람이 원인을 못 찾는다. 세 갈래 안내가 다 있어야 한다.
      let message = '';
      try {
        assertDestructiveResetIsSafe({ DATABASE_URL: URL_OF('sr_db') });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message, '가드가 던지지 않았습니다.').not.toBe('');
      expect(message).toContain('sr_db');
      expect(message).toContain('SKIP_DB_TESTS=true');
      expect(message).toContain('ALLOW_DESTRUCTIVE_DB_RESET=true');
      expect(message).toContain('TRUNCATE');
    });

    it('테스트 DB 면 던지지 않는다', () => {
      expect(() => assertDestructiveResetIsSafe({ DATABASE_URL: URL_OF('sr_ci') })).not.toThrow();
    });
  });
});
