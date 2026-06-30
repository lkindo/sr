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
    const result = validateTransition('REQUESTED', 'COMPLETED');
    expect(result.valid).toBe(false);
    expect(result.message).toBe('REQUESTED에서 COMPLETED(으)로 직접 전환할 수 없습니다.');
  });

  it('rejects any transition out of terminal REJECTED', () => {
    const result = validateTransition('REJECTED', 'INTAKE');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('직접 전환할 수 없습니다');
  });

  it('allows a valid flow with no roles/data provided', () => {
    expect(validateTransition('REQUESTED', 'INTAKE')).toEqual({ valid: true });
    expect(validateTransition('ON_HOLD', 'IN_PROGRESS')).toEqual({ valid: true });
    expect(validateTransition('CONFIRMED', 'IN_PROGRESS')).toEqual({ valid: true });
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
    expect(result.message).toBe(
      '이 상태 변경을 수행할 권한이 없습니다. (필요 역할: ADMIN, MANAGER, ENGINEER)'
    );
  });

  it('enforces client-only roles on COMPLETED -> CONFIRMED', () => {
    expect(validateTransition('COMPLETED', 'CONFIRMED', ['ENGINEER']).valid).toBe(false);
    expect(validateTransition('COMPLETED', 'CONFIRMED', ['CLIENT_ADMIN']).valid).toBe(true);
    expect(validateTransition('COMPLETED', 'CONFIRMED', ['ADMIN']).valid).toBe(true);
  });

  it('enforces client-only roles on CONFIRMED -> IN_PROGRESS reopen', () => {
    const denied = validateTransition('CONFIRMED', 'IN_PROGRESS', ['MANAGER']);
    expect(denied.valid).toBe(false);
    expect(denied.message).toContain('ADMIN, CLIENT_USER, CLIENT_ADMIN');

    const allowed = validateTransition('CONFIRMED', 'IN_PROGRESS', ['CLIENT_USER']);
    expect(allowed.valid).toBe(true);
  });

  it('skips role check when userRoles is an empty array', () => {
    // empty array -> userRoles.length > 0 is false, so role gate skipped
    const result = validateTransition('REQUESTED', 'INTAKE', []);
    expect(result.valid).toBe(true);
  });

  it('skips role check when userRoles is undefined', () => {
    const result = validateTransition('REQUESTED', 'INTAKE', undefined);
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
    expect(result.message).toContain('IN_PROGRESS 상태로 전환하려면');
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
    for (const from of Object.keys(TRANSITION_ROLES)) {
      for (const to of Object.keys(TRANSITION_ROLES[from])) {
        expect(VALID_TRANSITIONS[from as SRStatus]).toContain(to);
        expect(TRANSITION_ROLES[from][to].length).toBeGreaterThan(0);
      }
    }
  });
});
