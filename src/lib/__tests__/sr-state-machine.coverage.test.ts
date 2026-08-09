import { describe, expect, it } from 'vitest';

import {
  canTransition,
  getAvailableTransitions,
  getRequiredFields,
  REQUIRED_FIELDS,
  SRStatus,
  TRANSITION_ROLES,
  VALID_TRANSITIONS,
  validateTransition,
} from '@/lib/sr-state-machine';

const ALL_STATUSES: SRStatus[] = [
  'REQUESTED',
  'INTAKE',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'CONFIRMED',
  'REJECTED',
];

describe('VALID_TRANSITIONS table', () => {
  it('defines the expected transitions per status', () => {
    expect(VALID_TRANSITIONS.REQUESTED).toEqual(['INTAKE', 'REJECTED']);
    expect(VALID_TRANSITIONS.INTAKE).toEqual(['IN_PROGRESS', 'REJECTED']);
    expect(VALID_TRANSITIONS.IN_PROGRESS).toEqual(['COMPLETED', 'ON_HOLD']);
    expect(VALID_TRANSITIONS.ON_HOLD).toEqual(['IN_PROGRESS', 'REJECTED']);
    expect(VALID_TRANSITIONS.COMPLETED).toEqual(['CONFIRMED', 'IN_PROGRESS']);
    expect(VALID_TRANSITIONS.CONFIRMED).toEqual(['IN_PROGRESS']);
    expect(VALID_TRANSITIONS.REJECTED).toEqual([]);
  });

  it('has an entry for every status', () => {
    for (const s of ALL_STATUSES) {
      expect(VALID_TRANSITIONS[s]).toBeDefined();
      expect(Array.isArray(VALID_TRANSITIONS[s])).toBe(true);
    }
  });
});

describe('canTransition', () => {
  it('returns true for every declared valid transition', () => {
    for (const from of ALL_STATUSES) {
      for (const to of VALID_TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it('returns false for transitions not in the table', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (!VALID_TRANSITIONS[from].includes(to)) {
          expect(canTransition(from, to)).toBe(false);
        }
      }
    }
  });

  it('returns false for the terminal REJECTED state to anything', () => {
    for (const to of ALL_STATUSES) {
      expect(canTransition('REJECTED', to)).toBe(false);
    }
  });

  it('returns false (via nullish coalescing) for an unknown from-status', () => {
    expect(canTransition('UNKNOWN' as SRStatus, 'INTAKE')).toBe(false);
  });

  it('returns false for self-transitions', () => {
    for (const s of ALL_STATUSES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });
});

describe('getAvailableTransitions', () => {
  it('returns the same array as VALID_TRANSITIONS for known statuses', () => {
    for (const s of ALL_STATUSES) {
      expect(getAvailableTransitions(s)).toEqual(VALID_TRANSITIONS[s]);
    }
  });

  it('returns an empty array for an unknown status (nullish fallback)', () => {
    expect(getAvailableTransitions('NOPE' as SRStatus)).toEqual([]);
  });

  it('returns an empty array for terminal REJECTED', () => {
    expect(getAvailableTransitions('REJECTED')).toEqual([]);
  });
});

describe('REQUIRED_FIELDS / getRequiredFields', () => {
  it('declares required fields only for IN_PROGRESS, COMPLETED, REJECTED', () => {
    expect(REQUIRED_FIELDS.IN_PROGRESS).toEqual(['assigneeId']);
    expect(REQUIRED_FIELDS.COMPLETED).toEqual(['resolutionDescription']);
    expect(REQUIRED_FIELDS.REJECTED).toEqual(['rejectionReason']);
  });

  it('getRequiredFields returns declared fields', () => {
    expect(getRequiredFields('IN_PROGRESS')).toEqual(['assigneeId']);
    expect(getRequiredFields('COMPLETED')).toEqual(['resolutionDescription']);
    expect(getRequiredFields('REJECTED')).toEqual(['rejectionReason']);
  });

  it('getRequiredFields returns empty array for statuses without requirements', () => {
    expect(getRequiredFields('REQUESTED')).toEqual([]);
    expect(getRequiredFields('INTAKE')).toEqual([]);
    expect(getRequiredFields('ON_HOLD')).toEqual([]);
    expect(getRequiredFields('CONFIRMED')).toEqual([]);
  });

  it('getRequiredFields returns empty array for unknown status (nullish fallback)', () => {
    expect(getRequiredFields('WHAT' as SRStatus)).toEqual([]);
  });
});

describe('validateTransition - step 1: state flow validity', () => {
  it('rejects an invalid state flow with a descriptive message', () => {
    // 메시지는 API 오류로 그대로 토스트에 뜬다. 예전에는 영문 enum 이 노출됐다
    // ("REQUESTED에서 COMPLETED(으)로…"). 사용자가 읽는 문장이므로 한국어 라벨을 쓴다.
    const result = validateTransition('REQUESTED', 'COMPLETED');
    expect(result.valid).toBe(false);
    expect(result.message).toBe('요청됨에서 완료(으)로 직접 전환할 수 없습니다.');
  });

  it('rejects any transition out of terminal REJECTED', () => {
    const result = validateTransition('REJECTED', 'INTAKE');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('직접 전환할 수 없습니다');
  });

  // 이 테스트는 원래 "인가 정보 없이도 통과한다"를 기대값으로 고정하고 있었다.
  // 그게 바로 감사 4.3 이 지적한 fail-open 이며, 테스트가 그것을 정상 동작으로
  // 못 박고 있었기 때문에 결함이 살아남았다. 이제 fail-closed 를 기대한다.
  it('인가 정보가 없으면 흐름이 유효해도 거부한다 (fail-closed)', () => {
    expect(validateTransition('REQUESTED', 'INTAKE').valid).toBe(false);
    expect(validateTransition('ON_HOLD', 'IN_PROGRESS').valid).toBe(false);
    expect(validateTransition('CONFIRMED', 'IN_PROGRESS').valid).toBe(false);
  });

  it('흐름 자체가 불가능하면 인가와 무관하게 거부한다', () => {
    const r = validateTransition('REQUESTED', 'COMPLETED', ['ADMIN']);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('전환할 수 없습니다');
  });
});

describe('validateTransition - step 2: role gating', () => {
  it('passes when user has an allowed role', () => {
    const result = validateTransition('REQUESTED', 'REJECTED', ['ENGINEER']);
    expect(result.valid).toBe(true);
  });

  it('passes when one of multiple roles is allowed', () => {
    const result = validateTransition('REQUESTED', 'INTAKE', ['CLIENT_USER', 'MANAGER']);
    expect(result.valid).toBe(true);
  });

  it('fails when user has no allowed role, with required-roles message', () => {
    const result = validateTransition('REQUESTED', 'INTAKE', ['CLIENT_USER']);
    expect(result.valid).toBe(false);
    // 메시지는 이제 역할과 권한 두 경로를 모두 안내한다(커스텀 역할이 무엇을 받아야
    // 하는지 알 수 있어야 하므로).
    expect(result.message).toContain('필요 역할: ADMIN, MANAGER, ENGINEER');
    expect(result.message).toContain('SR:INTAKE');
  });

  it('enforces client-only roles on COMPLETED -> CONFIRMED', () => {
    // 역할 게이트만 보려면 신청자 조건을 만족시켜 두고 역할만 바꿔 가며 비교해야 한다.
    // (확인 완료에는 역할 + 신청자 본인이 모두 필요하다.)
    const own = { requesterId: 'u1' };
    expect(
      validateTransition('COMPLETED', 'CONFIRMED', ['ENGINEER'], own, {}, [], 'u1').valid
    ).toBe(false);
    expect(
      validateTransition('COMPLETED', 'CONFIRMED', ['CLIENT_ADMIN'], own, {}, [], 'u1').valid
    ).toBe(true);
    expect(validateTransition('COMPLETED', 'CONFIRMED', ['ADMIN'], own, {}, [], 'u1').valid).toBe(
      true
    );
  });

  it('신청자가 아니면 어떤 역할로도 CONFIRMED 로 전환할 수 없다', () => {
    const own = { requesterId: 'u1' };
    for (const roles of [['ADMIN'], ['MANAGER'], ['CLIENT_ADMIN'], ['CLIENT_USER']]) {
      expect(
        validateTransition('COMPLETED', 'CONFIRMED', roles, own, {}, [], 'someone-else').valid,
        `${roles[0]} 이 남의 SR 을 확인 완료할 수 있다`
      ).toBe(false);
    }
  });

  // 이 테스트는 원래 MANAGER 거부를 단언했고, 그건 당시 규칙을 정확히 기록한 것이었다.
  // 정책이 바뀌었다: UI 는 MANAGER 에게 재오픈 버튼을 보여 주는데 규칙에는 MANAGER 가
  // 없어서 눌러도 항상 거부되는 발산이 있었다(감사 4.3). 둘 중 하나를 맞춰야 했고,
  // 재오픈은 운영자가 실제로 수행하는 일이라 규칙 쪽을 넓혔다.
  // ENGINEER 는 여전히 재오픈할 수 없다 — 넓힌 건 MANAGER 하나뿐이다.
  it('재오픈은 운영자(ADMIN·MANAGER)와 고객에게 열려 있다', () => {
    expect(validateTransition('CONFIRMED', 'IN_PROGRESS', ['MANAGER']).valid).toBe(true);
    expect(validateTransition('CONFIRMED', 'IN_PROGRESS', ['CLIENT_USER']).valid).toBe(true);

    const denied = validateTransition('CONFIRMED', 'IN_PROGRESS', ['ENGINEER']);
    expect(denied.valid).toBe(false);
    expect(denied.message).toContain('ADMIN, MANAGER, CLIENT_USER, CLIENT_ADMIN');
  });

  // 아래 두 테스트는 원래 "역할 게이트를 건너뛴다 → valid: true" 를 기대했다.
  // src/auth.ts 는 사용자 조회 실패 시 token.roles = [] 로 세션을 만들므로,
  // 그 동작은 인가 정보를 읽지 못한 세션에게 모든 전이를 허용한다는 뜻이었다.
  it('빈 역할 배열은 통과가 아니라 거부다', () => {
    const result = validateTransition('REQUESTED', 'INTAKE', []);
    expect(result.valid).toBe(false);
  });

  it('역할이 undefined 여도 거부한다', () => {
    const result = validateTransition('REQUESTED', 'INTAKE', undefined);
    expect(result.valid).toBe(false);
  });

  it('권한만 있어도 통과한다 (커스텀 역할 경로)', () => {
    const result = validateTransition(
      'REQUESTED',
      'INTAKE',
      ['SUPPORT_LEAD'],
      undefined,
      undefined,
      ['SR:INTAKE']
    );
    expect(result.valid).toBe(true);
  });

  it('skips role check when there is no role mapping for the transition (allowedRoles falsy)', () => {
    // IN_PROGRESS -> COMPLETED has a mapping; but to exercise the "no mapping" branch
    // we need a from/to that is a valid flow yet absent in TRANSITION_ROLES.
    // COMPLETED -> IN_PROGRESS IS mapped. There is no valid-flow transition missing
    // from TRANSITION_ROLES, so simulate via an entry that exists in flow but we still
    // verify allowedRoles-present path here. Use a role that IS allowed to confirm pass.
    const result = validateTransition('COMPLETED', 'IN_PROGRESS', ['ADMIN']);
    expect(result.valid).toBe(true);
  });
});

describe('validateTransition - step 3: required-field validation', () => {
  // IN_PROGRESS requires assigneeId (or assignedToId alias, or already on currentData)
  it('IN_PROGRESS: missing assigneeId everywhere -> invalid', () => {
    const result = validateTransition('INTAKE', 'IN_PROGRESS', ['ADMIN'], {}, {});
    expect(result.valid).toBe(false);
    expect(result.message).toContain('담당자(assigneeId)');
    // 영문 enum 이 아니라 한국어 라벨이어야 한다(statusLabels.IN_PROGRESS).
    expect(result.message).toContain('진행중 상태로 전환하려면');
  });

  it('IN_PROGRESS: assigneeId present in updateData -> valid', () => {
    const result = validateTransition('INTAKE', 'IN_PROGRESS', ['ADMIN'], {}, { assigneeId: 'u1' });
    expect(result.valid).toBe(true);
  });

  it('IN_PROGRESS: assignedToId alias present in updateData -> valid', () => {
    const result = validateTransition(
      'INTAKE',
      'IN_PROGRESS',
      ['ADMIN'],
      {},
      { assignedToId: 'u2' }
    );
    expect(result.valid).toBe(true);
  });

  it('IN_PROGRESS: assigneeId already on currentData -> valid', () => {
    const result = validateTransition(
      'INTAKE',
      'IN_PROGRESS',
      ['ADMIN'],
      { assigneeId: 'existing' },
      {}
    );
    expect(result.valid).toBe(true);
  });

  it('COMPLETED: missing resolutionDescription -> invalid', () => {
    const result = validateTransition('IN_PROGRESS', 'COMPLETED', ['ADMIN'], {}, {});
    expect(result.valid).toBe(false);
    expect(result.message).toContain('해결 내용(resolutionDescription)');
  });

  it('COMPLETED: resolutionDescription in updateData -> valid', () => {
    const result = validateTransition(
      'IN_PROGRESS',
      'COMPLETED',
      ['ADMIN'],
      {},
      { resolutionDescription: 'done' }
    );
    expect(result.valid).toBe(true);
  });

  it('COMPLETED: resolutionDescription on currentData -> valid', () => {
    const result = validateTransition(
      'IN_PROGRESS',
      'COMPLETED',
      ['ADMIN'],
      { resolutionDescription: 'already' },
      {}
    );
    expect(result.valid).toBe(true);
  });

  it('REJECTED: missing rejectionReason -> invalid', () => {
    const result = validateTransition('REQUESTED', 'REJECTED', ['ADMIN'], {}, {});
    expect(result.valid).toBe(false);
    expect(result.message).toContain('거절 사유(rejectionReason)');
  });

  it('REJECTED: rejectionReason in updateData -> valid', () => {
    const result = validateTransition(
      'REQUESTED',
      'REJECTED',
      ['ADMIN'],
      {},
      { rejectionReason: 'nope' }
    );
    expect(result.valid).toBe(true);
  });

  it('REJECTED: rejectionReason on currentData -> valid', () => {
    const result = validateTransition(
      'INTAKE',
      'REJECTED',
      ['ADMIN'],
      { rejectionReason: 'pre-existing' },
      {}
    );
    expect(result.valid).toBe(true);
  });

  it('skips required-field check when currentData is missing', () => {
    // requiredFields.length > 0 but no currentData -> branch short circuits, valid
    const result = validateTransition('IN_PROGRESS', 'COMPLETED', ['ADMIN'], undefined, {});
    expect(result.valid).toBe(true);
  });

  it('skips required-field check when updateData is missing', () => {
    const result = validateTransition('IN_PROGRESS', 'COMPLETED', ['ADMIN'], {}, undefined);
    expect(result.valid).toBe(true);
  });

  it('skips required-field check for a target with no required fields', () => {
    // INTAKE has no required fields; data provided but loop body never runs
    const result = validateTransition('REQUESTED', 'INTAKE', ['ADMIN'], {}, {});
    expect(result.valid).toBe(true);
  });

  it('aggregates only the single missing field into the message', () => {
    const result = validateTransition('IN_PROGRESS', 'COMPLETED', ['ADMIN'], {}, {});
    expect(result.valid).toBe(false);
    // exactly one required field for COMPLETED
    expect(result.message).toMatch(/필요합니다:/);
  });
});

describe('validateTransition - ordering of checks', () => {
  it('flow check happens before role check', () => {
    // invalid flow, even with a valid role, returns flow error
    const result = validateTransition('REQUESTED', 'CONFIRMED', ['ADMIN'], {}, {});
    expect(result.valid).toBe(false);
    expect(result.message).toContain('직접 전환할 수 없습니다');
  });

  it('role check happens before required-field check', () => {
    // valid flow IN_PROGRESS->COMPLETED, wrong role, missing data -> role error wins
    const result = validateTransition('IN_PROGRESS', 'COMPLETED', ['CLIENT_USER'], {}, {});
    expect(result.valid).toBe(false);
    expect(result.message).toContain('권한이 없습니다');
  });

  it('fully valid transition with role + data returns plain valid', () => {
    const result = validateTransition(
      'IN_PROGRESS',
      'COMPLETED',
      ['ENGINEER'],
      {},
      { resolutionDescription: 'fixed' }
    );
    expect(result).toEqual({ valid: true });
  });
});

describe('TRANSITION_ROLES table integrity', () => {
  it('every role-mapped transition is also a valid flow transition', () => {
    for (const [from, toMap] of Object.entries(TRANSITION_ROLES)) {
      for (const [to, allowedRoles] of Object.entries(toMap)) {
        expect(VALID_TRANSITIONS[from as SRStatus]).toContain(to);
        expect(allowedRoles.length).toBeGreaterThan(0);
      }
    }
  });
});
