import { afterEach, describe, expect, it, vi } from 'vitest';

import { canUpdateSR } from '@/lib/policies';
import {
  canViewerUpdateSR,
  getReopenAvailability,
  getReopenBlock,
  type ReopenSubject,
  type ReopenViewer,
  type SRStatus,
  validateTransition,
} from '@/lib/sr-state-machine';
import type { AuthenticatedUser } from '@/types/session';

/**
 * 재오픈 판정의 단일 원천(getReopenBlock / getReopenAvailability).
 *
 * 이 파일이 막으려는 사고는 "화면은 된다(또는 안 된다)고 하는데 서버는 반대로 답한다" 이다.
 * 2026-09 스테이징에서 ADMIN 이 완료 SR 을 재오픈하지 못했는데 화면은 이유를 제대로 보여
 * 주지 못했다. 원인을 좇다 보니 화면의 사본 판정이 서버와 네 군데에서 갈라져 있었다:
 *   1. CONFIRMED 기산점(서버 confirmedAt / 화면 completedAt) — 늦게 확인한 SR 을 화면이 막음
 *   2. 신청자가 아닌 같은 고객사 CLIENT_USER — 화면은 활성 버튼, 서버는 403
 *   3. 기산점 NULL — 화면은 제출 허용, 서버는 400 (fail-closed)
 *   4. 담당자 없는 완료 SR — 화면은 제출 허용, 서버는 400 (그리고 완료 상태에선 담당자 지정 불가)
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WINDOW = 7 * DAY;

/** 판정 기준 시각. 실행 시점과 무관하게 경계를 고정한다. */
const NOW = Date.parse('2026-09-18T03:00:00Z'); // 2026-09-18 12:00 KST

const ago = (ms: number) => new Date(NOW - ms);

describe('getReopenBlock — 7일(168시간) 창', () => {
  const base: ReopenSubject = { assigneeId: 'eng-1' };

  it.each([
    ['168시간 - 1ms', WINDOW - 1, null],
    ['정확히 168시간', WINDOW, null],
    ['168시간 + 1ms', WINDOW + 1, 'WINDOW_EXPIRED'],
    ['8일', 8 * DAY, 'WINDOW_EXPIRED'],
  ] as const)('COMPLETED 에서 완료 후 %s 이면 %s', (_label, elapsed, expected) => {
    const block = getReopenBlock('COMPLETED', { ...base, completedAt: ago(elapsed) }, NOW);
    expect(block?.code ?? null).toBe(expected);
  });

  it('재오픈 출발 상태가 아니면 판정하지 않는다', () => {
    for (const status of ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'REJECTED'] as const) {
      expect(getReopenBlock(status, { completedAt: null, assigneeId: null }, NOW)).toBeNull();
    }
  });

  it('now 를 Date 로 넘겨도 같은 판정이다', () => {
    const sr = { ...base, completedAt: ago(WINDOW + 1) };
    expect(getReopenBlock('COMPLETED', sr, new Date(NOW))?.code).toBe('WINDOW_EXPIRED');
  });
});

describe('getReopenBlock — 기산점은 출발 상태를 따른다', () => {
  /**
   * 화면 버그 1 의 재현. 완료 20일 뒤에 확인하고 2일 뒤 재오픈 — 서버는 허용하는데
   * 예전 화면은 completedAt 만 보고 "완료 후 7일이 지나" 로 막았다.
   */
  it('늦게 확인한 CONFIRMED SR 은 확인 시각부터 세므로 재오픈할 수 있다', () => {
    const block = getReopenBlock(
      'CONFIRMED',
      { assigneeId: 'eng-1', completedAt: ago(20 * DAY), confirmedAt: ago(2 * DAY) },
      NOW
    );
    expect(block).toBeNull();
  });

  it('CONFIRMED 창이 닫히면 "확인 후" 라고 말하고 확인 시각을 싣는다', () => {
    const confirmedAt = ago(8 * DAY);
    const block = getReopenBlock(
      'CONFIRMED',
      { assigneeId: 'eng-1', completedAt: ago(9 * DAY), confirmedAt },
      NOW
    );
    expect(block?.code).toBe('WINDOW_EXPIRED');
    expect(block?.message).toMatch(/^확인 후 7일이 지나 재오픈할 수 없습니다\./);
    expect(block?.message).not.toContain('완료 후');
    expect(block?.anchorAt?.getTime()).toBe(confirmedAt.getTime());
    expect(block?.deadlineAt?.getTime()).toBe(confirmedAt.getTime() + WINDOW);
  });

  it('COMPLETED 창이 닫히면 "완료 후" 라고 말한다(확인 시각이 있어도 보지 않는다)', () => {
    const block = getReopenBlock(
      'COMPLETED',
      { assigneeId: 'eng-1', completedAt: ago(8 * DAY), confirmedAt: ago(1 * DAY) },
      NOW
    );
    expect(block?.code).toBe('WINDOW_EXPIRED');
    expect(block?.message).toMatch(/^완료 후 7일이 지나 재오픈할 수 없습니다\./);
  });

  it('CONFIRMED 인데 확인 시각이 없으면 완료 시각으로 폴백하고, 문구도 "완료" 로 말한다', () => {
    const block = getReopenBlock(
      'CONFIRMED',
      { assigneeId: 'eng-1', completedAt: ago(8 * DAY), confirmedAt: null },
      NOW
    );
    expect(block?.code).toBe('WINDOW_EXPIRED');
    expect(block?.message).toMatch(/^완료 후 7일이 지나/);
  });
});

describe('getReopenBlock — 안내 문구의 날짜는 KST 다', () => {
  it('완료 시각과 재오픈 기한을 KST "YYYY. MM. DD. HH:mm" 으로 싣고 다음 행동을 안내한다', () => {
    // 2026-09-01 05:00 UTC = 2026-09-01 14:00 KST
    const block = getReopenBlock(
      'COMPLETED',
      { assigneeId: 'eng-1', completedAt: '2026-09-01T05:00:00.000Z' },
      NOW
    );
    expect(block?.message).toBe(
      '완료 후 7일이 지나 재오픈할 수 없습니다. ' +
        '(완료 2026. 09. 01. 14:00 · 재오픈 기한 2026. 09. 08. 14:00) ' +
        '추가 작업이 필요하면 새 SR을 등록해주세요.'
    );
  });

  /** UTC 로 찍었다면 날짜가 하루 앞선 09-01 16:30 으로 보였을 시각이다. */
  it('UTC 와 KST 의 날짜가 다른 시각도 KST 달력으로 표기한다', () => {
    const block = getReopenBlock(
      'COMPLETED',
      { assigneeId: 'eng-1', completedAt: '2026-09-01T16:30:00.000Z' },
      NOW
    );
    expect(block?.message).toContain(
      '(완료 2026. 09. 02. 01:30 · 재오픈 기한 2026. 09. 09. 01:30)'
    );
  });
});

describe('getReopenBlock — fail-closed 와 담당자', () => {
  it.each([
    ['COMPLETED, 완료 시각 NULL', 'COMPLETED', { completedAt: null }, '완료'],
    ['COMPLETED, 완료 시각 없음', 'COMPLETED', {}, '완료'],
    ['COMPLETED, 파싱 불가', 'COMPLETED', { completedAt: 'not-a-date' }, '완료'],
    ['CONFIRMED, 둘 다 NULL', 'CONFIRMED', { completedAt: null, confirmedAt: null }, '확인'],
    // 빈 문자열은 "값이 없다" 가 아니라 **손상된 기록**이다. completedAt 으로 폴백해
    // 재오픈을 열어 주면 fail-closed 가 아니다(?? 를 truthy 검사로 바꾸면 그렇게 된다).
    [
      'CONFIRMED, 확인 시각이 빈 문자열',
      'CONFIRMED',
      { completedAt: ago(DAY), confirmedAt: '' },
      '확인',
    ],
  ] as const)('%s 이면 ANCHOR_UNKNOWN 으로 거부한다', (_label, status, data, missing) => {
    const block = getReopenBlock(status, { assigneeId: 'eng-1', ...data }, NOW);
    expect(block?.code).toBe('ANCHOR_UNKNOWN');
    // 화면에 없는 '종결 시각' 이 아니라 사용자가 보는 이름(완료/확인)으로 말한다.
    expect(block?.message).toBe(
      `${missing} 시각 기록이 없어 재오픈 기한(7일)을 확인할 수 없습니다. ` +
        '추가 작업이 필요하면 새 SR을 등록하거나 관리자에게 문의해주세요.'
    );
    expect(block?.anchorAt).toBeUndefined();
  });

  it('창 안이어도 담당자가 없으면 ASSIGNEE_MISSING 이다', () => {
    const block = getReopenBlock('COMPLETED', { completedAt: ago(DAY), assigneeId: null }, NOW);
    expect(block?.code).toBe('ASSIGNEE_MISSING');
    expect(block?.message).toContain('담당자가 지정되지 않아 재오픈할 수 없습니다.');
  });

  // 담당자를 채워도 창이 닫혀 있으면 어차피 안 된다 — 고칠 수 없는 이유를 먼저 말한다.
  it('창 만료와 담당자 없음이 겹치면 창 만료를 말한다', () => {
    const block = getReopenBlock('COMPLETED', { completedAt: ago(8 * DAY), assigneeId: null }, NOW);
    expect(block?.code).toBe('WINDOW_EXPIRED');
  });

  it('기산점 불명과 담당자 없음이 겹치면 기산점 불명을 말한다', () => {
    const block = getReopenBlock('COMPLETED', { completedAt: null, assigneeId: null }, NOW);
    expect(block?.code).toBe('ANCHOR_UNKNOWN');
  });
});

/**
 * 서버와 화면이 같은 답을 내는지 **조합 전체**에서 대조한다.
 *
 * 서버 경로(validateTransition)에 사유와 권한을 채워 넣으면, 남는 거부 사유는 재오픈 규칙뿐이다.
 * 그때 서버의 valid/message 는 getReopenBlock 의 null/message 와 글자까지 같아야 한다.
 */
describe('getReopenBlock ↔ validateTransition 동치', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const anchors = [null, 'garbage', ago(DAY), ago(WINDOW), ago(WINDOW + 1), ago(30 * DAY)] as const;
  const assignees = [null, 'eng-1'] as const;
  const scenarios: { from: SRStatus; data: ReopenSubject }[] = [];
  for (const completedAt of anchors) {
    for (const assigneeId of assignees) {
      scenarios.push({ from: 'COMPLETED', data: { completedAt, assigneeId } });
      for (const confirmedAt of anchors) {
        scenarios.push({ from: 'CONFIRMED', data: { completedAt, confirmedAt, assigneeId } });
      }
    }
  }

  it(`${scenarios.length} 개 조합에서 서버 판정과 화면 판정이 같다`, () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    for (const { from, data } of scenarios) {
      const block = getReopenBlock(from, data, NOW);
      const server = validateTransition(from, 'IN_PROGRESS', ['ADMIN'], data, {
        changeReason: '재작업',
      });
      const label = `${from} ${JSON.stringify(data)}`;
      expect(server.valid, label).toBe(block === null);
      expect(server.message, label).toBe(block?.message);
    }
  });
});

// ============================================================================
// 권한 사본 — policies.canUpdateSR 과의 동치
// ============================================================================

describe('canViewerUpdateSR ↔ policies.canUpdateSR 동치', () => {
  const roleSets = [
    [],
    ['ADMIN'],
    ['MANAGER'],
    ['ENGINEER'],
    ['CLIENT_ADMIN'],
    ['CLIENT_USER'],
    ['MANAGER', 'ENGINEER'],
    ['ENGINEER', 'CLIENT_USER'],
    ['CUSTOM_ROLE'],
  ];
  const permissionSets = [
    [],
    ['SR:UPDATE'],
    ['SR:UPDATE_SELF'],
    ['SR:UPDATE', 'SR:UPDATE_SELF'],
    ['SR:CONFIRM'],
    // 대소문자가 다른 권한은 인정하지 않는다(hasPermissionFlag 는 정확 일치다).
    ['sr:update'],
  ];
  const clientIdSets = [[], ['client-1'], ['client-2'], ['client-2', 'client-1']];
  const people = ['viewer', 'someone-else'];

  it('역할·권한·소속·신청자·담당자 전 조합에서 결과가 같다', () => {
    let compared = 0;
    for (const roles of roleSets) {
      for (const permissions of permissionSets) {
        for (const clientIds of clientIdSets) {
          for (const requesterId of people) {
            for (const assigneeId of [...people, null]) {
              const viewer: ReopenViewer = { id: 'viewer', roles, permissions, clientIds };
              const sr = { id: 'sr-1', clientId: 'client-1', requesterId, assigneeId };
              const user: AuthenticatedUser = {
                ...viewer,
                email: 'viewer@example.com',
                name: null,
                image: null,
              };
              expect(
                canViewerUpdateSR(viewer, sr),
                JSON.stringify({ roles, permissions, clientIds, requesterId, assigneeId })
              ).toBe(canUpdateSR(user, sr));
              compared++;
            }
          }
        }
      }
    }
    // 루프가 조용히 비어 "0건 대조로 통과" 하지 않았음을 못박는다.
    expect(compared).toBe(
      roleSets.length * permissionSets.length * clientIdSets.length * people.length * 3
    );
  });
});

// ============================================================================
// getReopenAvailability — 버튼 노출 · 비활성 · 이유
// ============================================================================

describe('getReopenAvailability', () => {
  /** prisma/seed.ts 가 역할마다 부여하는 SR 권한. */
  const SEED_PERMISSIONS = {
    ADMIN: ['SR:UPDATE', 'SR:UPDATE_SELF', 'SR:STATUS_CHANGE', 'SR:CONFIRM'],
    MANAGER: ['SR:READ', 'SR:UPDATE', 'SR:UPDATE_SELF', 'SR:STATUS_CHANGE', 'SR:INTAKE'],
    ENGINEER: ['SR:READ', 'SR:UPDATE', 'SR:STATUS_CHANGE', 'SR:INTAKE'],
    CLIENT_ADMIN: ['SR:READ', 'SR:UPDATE', 'SR:STATUS_CHANGE', 'SR:CONFIRM'],
    CLIENT_USER: ['SR:READ', 'SR:UPDATE_SELF', 'SR:CONFIRM'],
  } as const;

  type SeedRole = keyof typeof SEED_PERMISSIONS;

  const viewerAs = (role: SeedRole, id = 'viewer'): ReopenViewer => ({
    id,
    roles: [role],
    permissions: [...SEED_PERMISSIONS[role]],
    clientIds: role.startsWith('CLIENT_') ? ['client-1'] : [],
  });

  /** 7일 창 안, 담당자 있음 — 데이터 규칙상으로는 재오픈 가능한 SR. */
  const freshSR = {
    clientId: 'client-1',
    requesterId: 'requester',
    assigneeId: 'eng-1',
    completedAt: ago(DAY),
    confirmedAt: null,
  };

  it('완료/확인완료가 아니면 버튼을 보이지 않는다', () => {
    for (const status of ['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'REJECTED'] as const) {
      expect(getReopenAvailability(status, freshSR, viewerAs('ADMIN'), NOW)).toEqual({
        visible: false,
        block: null,
      });
    }
  });

  it.each(['ADMIN', 'MANAGER', 'CLIENT_ADMIN'] as const)(
    '%s 는 신청자가 아니어도 창 안의 SR 을 재오픈할 수 있다',
    (role) => {
      for (const status of ['COMPLETED', 'CONFIRMED'] as const) {
        expect(getReopenAvailability(status, freshSR, viewerAs(role), NOW)).toEqual({
          visible: true,
          block: null,
        });
      }
    }
  );

  it('신청자 CLIENT_USER 는 재오픈할 수 있다', () => {
    expect(
      getReopenAvailability('COMPLETED', freshSR, viewerAs('CLIENT_USER', 'requester'), NOW)
    ).toEqual({ visible: true, block: null });
  });

  // PRD 4.5 / 2026-08-01 결정: ENGINEER 는 재오픈하지 않는다. 노출도 예전과 같다(숨김).
  it('신청자가 아닌 ENGINEER 에게는 버튼을 보이지 않는다(담당자여도)', () => {
    const engineer = viewerAs('ENGINEER', 'eng-1');
    expect(getReopenAvailability('COMPLETED', freshSR, engineer, NOW)).toEqual({
      visible: false,
      block: null,
    });
  });

  /**
   * 화면 버그 2 의 재현. 역할표만 보면 CLIENT_USER 는 재오픈 가능 역할이라 버튼이 활성이었고,
   * 서버는 ensureCanUpdateSR 에서 403('SR 수정 권한이 없습니다.')을 돌려줬다.
   */
  it('같은 고객사의 신청자가 아닌 CLIENT_USER 는 버튼은 보이되 막히고 이유를 받는다', () => {
    const result = getReopenAvailability('COMPLETED', freshSR, viewerAs('CLIENT_USER'), NOW);
    expect(result.visible).toBe(true);
    expect(result.block?.code).toBe('NOT_PERMITTED');
    expect(result.block?.message).toBe(
      '요청자 본인 또는 고객사 관리자만 재오픈할 수 있습니다. ' +
        '재오픈이 필요하면 요청자나 고객사 관리자에게 요청해주세요.'
    );
  });

  it('SR:UPDATE 가 없는 내부 사용자에게는 내부용 문구를 준다', () => {
    const manager: ReopenViewer = { ...viewerAs('MANAGER'), permissions: ['SR:READ'] };
    const result = getReopenAvailability('COMPLETED', freshSR, manager, NOW);
    expect(result.block?.code).toBe('NOT_PERMITTED');
    expect(result.block?.message).toContain('이 SR을 수정할 권한이 없어 재오픈할 수 없습니다.');
  });

  /**
   * 신청자이고 SR 수정도 되지만 재오픈 전이 권한이 없는 경우(예: 커스텀 역할).
   * 예전에는 신청자라는 이유만으로 활성 버튼을 받고 서버 인가에서 400 을 맞았다.
   * 이유 문구는 서버 인가 단계의 문구와 글자까지 같다.
   */
  it('전이 권한이 없는 신청자는 버튼은 보이되 서버 인가 문구로 막힌다', () => {
    const viewer: ReopenViewer = {
      id: 'requester',
      roles: ['CUSTOM_ROLE'],
      permissions: ['SR:UPDATE_SELF'],
      clientIds: ['client-1'],
    };
    const result = getReopenAvailability('CONFIRMED', freshSR, viewer, NOW);
    const server = validateTransition(
      'CONFIRMED',
      'IN_PROGRESS',
      viewer.roles,
      undefined,
      undefined,
      viewer.permissions
    );
    expect(server.valid).toBe(false);
    expect(result).toEqual({
      visible: true,
      block: { code: 'NOT_PERMITTED', message: server.message },
    });
  });

  // 서버는 인가(403/400)를 재오픈 규칙보다 먼저 본다. 화면도 같은 이유를 말해야 한다.
  it('권한 문제와 창 만료가 겹치면 권한 문제를 말한다', () => {
    const expired = { ...freshSR, completedAt: ago(8 * DAY) };
    const result = getReopenAvailability('COMPLETED', expired, viewerAs('CLIENT_USER'), NOW);
    expect(result.block?.code).toBe('NOT_PERMITTED');
  });

  it.each([
    ['창 만료', { completedAt: ago(8 * DAY) }, 'WINDOW_EXPIRED'],
    ['기산점 NULL', { completedAt: null }, 'ANCHOR_UNKNOWN'],
    ['담당자 없음', { assigneeId: null }, 'ASSIGNEE_MISSING'],
  ] as const)('권한이 있는 ADMIN 도 %s 이면 막히고 그 이유를 받는다', (_label, patch, code) => {
    const result = getReopenAvailability(
      'COMPLETED',
      { ...freshSR, ...patch },
      viewerAs('ADMIN'),
      NOW
    );
    expect(result.visible).toBe(true);
    expect(result.block?.code).toBe(code);
    expect(result.block?.message).toBe(
      getReopenBlock('COMPLETED', { ...freshSR, ...patch }, NOW)?.message
    );
  });

  it('신원(id)이 비어 있으면 신청자로 취급하지 않는다', () => {
    const anonymous: ReopenViewer = { id: '', roles: [], permissions: [], clientIds: [] };
    expect(
      getReopenAvailability('COMPLETED', { ...freshSR, requesterId: '' }, anonymous, NOW)
    ).toEqual({ visible: false, block: null });
  });
});
