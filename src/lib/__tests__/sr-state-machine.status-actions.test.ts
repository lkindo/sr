import { describe, expect, it } from 'vitest';

import { statusActionSchema } from '../schemas';
import {
  canTransition,
  planStatusAction,
  SR_STATUS_ACTIONS,
  type SRStatus,
  type SRStatusAction,
} from '../sr-state-machine';

const ACTIONS = Object.entries(SR_STATUS_ACTIONS) as Array<
  [SRStatusAction, (typeof SR_STATUS_ACTIONS)[SRStatusAction]]
>;
const ALL_STATUSES: SRStatus[] = [
  'REQUESTED',
  'INTAKE',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CONFIRMED',
  'REJECTED',
];
const FULL_INPUT = {
  reason: '사유',
  resolutionDescription: '해결 내용',
  expectedHoldReleaseDate: '2026-12-01',
};

describe('상태 변경 액션 표', () => {
  // 아래 테스트들은 표에서 기대값을 끌어오므로, 표 자체가 틀어지면 여기서만 잡힌다.
  it('각 액션의 출발 상태와 목표 상태', () => {
    const summary = Object.fromEntries(ACTIONS.map(([action, r]) => [action, [r.from, r.to]]));

    expect(summary).toEqual({
      start: [['INTAKE'], 'IN_PROGRESS'],
      complete: [['IN_PROGRESS'], 'COMPLETED'],
      hold: [['IN_PROGRESS'], 'ON_HOLD'],
      resume: [['ON_HOLD'], 'IN_PROGRESS'],
      reject: [['REQUESTED', 'INTAKE', 'ON_HOLD'], 'REJECTED'],
      confirm: [['COMPLETED'], 'CONFIRMED'],
      reopen: [['COMPLETED', 'CONFIRMED'], 'IN_PROGRESS'],
    });
  });

  // 표가 전이표를 벗어나면 라우트는 통과시키고 저장에서 거부되는 막다른 길이 생긴다.
  it.each(ACTIONS)('%s 의 모든 출발 상태는 전이표에 있다', (_action, rule) => {
    for (const from of rule.from) {
      expect(canTransition(from, rule.to)).toBe(true);
    }
  });

  it.each(ACTIONS)('API 가 %s 액션을 받는다', (action) => {
    expect(statusActionSchema.safeParse({ action }).success).toBe(true);
  });

  it('API 가 받는 액션은 모두 표에 있다', () => {
    const accepted = statusActionSchema.shape.action.options;

    expect([...accepted].sort()).toEqual(Object.keys(SR_STATUS_ACTIONS).sort());
  });
});

describe('planStatusAction', () => {
  it.each(ACTIONS)('%s 는 표에 없는 출발 상태를 거부한다', (action, rule) => {
    for (const status of ALL_STATUSES.filter((s) => !rule.from.includes(s))) {
      expect(planStatusAction(action, status, FULL_INPUT)).toEqual({
        ok: false,
        message: rule.wrongStatusMessage,
      });
    }
  });

  it.each(ACTIONS)('%s 는 표의 출발 상태에서 목표 상태를 돌려준다', (action, rule) => {
    for (const status of rule.from) {
      expect(planStatusAction(action, status, FULL_INPUT)).toMatchObject({
        ok: true,
        to: rule.to,
      });
    }
  });

  it.each([
    [
      'complete',
      'IN_PROGRESS',
      { resolutionDescription: '해결' },
      { resolutionDescription: '해결' },
    ],
    [
      'hold',
      'IN_PROGRESS',
      { reason: '대기', expectedHoldReleaseDate: '2026-12-01' },
      { expectedHoldReleaseDate: '2026-12-01' },
    ],
    ['resume', 'ON_HOLD', {}, { expectedHoldReleaseDate: null }],
    ['reject', 'INTAKE', { reason: '중복' }, { rejectionReason: '중복' }],
    ['start', 'INTAKE', {}, {}],
    ['confirm', 'COMPLETED', {}, {}],
    ['reopen', 'CONFIRMED', { reason: '재작업' }, {}],
  ] as const)('%s 가 저장할 값', (action, status, input, fields) => {
    expect(planStatusAction(action, status, input)).toEqual({
      ok: true,
      to: SR_STATUS_ACTIONS[action].to,
      fields,
    });
  });

  it.each([
    ['complete', 'IN_PROGRESS', {}, '해결 내용'],
    ['hold', 'IN_PROGRESS', { expectedHoldReleaseDate: '2026-12-01' }, '보류 사유'],
    ['hold', 'IN_PROGRESS', { reason: '대기' }, '예상 해제일'],
    ['reject', 'REQUESTED', {}, '거절 사유'],
    ['reopen', 'COMPLETED', {}, '재오픈 사유'],
  ] as const)('%s 는 %s 에서 필수 입력이 없으면 거부한다', (action, status, input, word) => {
    const plan = planStatusAction(action, status, input);

    expect(plan.ok).toBe(false);
    expect(plan.ok === false && plan.message).toContain(word);
  });

  // 출발 상태가 틀렸는데 "사유를 입력하라" 고 하면 입력해도 소용없는 안내가 된다.
  it('출발 상태를 필수 입력보다 먼저 본다', () => {
    expect(planStatusAction('reject', 'COMPLETED', {})).toEqual({
      ok: false,
      message: SR_STATUS_ACTIONS.reject.wrongStatusMessage,
    });
  });
});
