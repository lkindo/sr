import { describe, expect, it } from 'vitest';

import {
  canChangeSLABasisAt,
  canViewerAdjustDueDate,
  isRejectBlockedAfterCompletion,
  SR_REJECT_AFTER_COMPLETION_MESSAGE,
  validateTransition,
} from '@/lib/sr-state-machine';

/**
 * 한 번 완료된 SR 의 마감일·거절 규칙(헌법 §2·§3, 2026-09-18 소유자 결정 D9).
 * 서버(sr.service.updateSR)와 화면(SR 상세의 조정·거절 버튼)이 이 함수들을 함께 쓴다.
 */
describe('canViewerAdjustDueDate', () => {
  const manager = { roles: ['MANAGER'], permissions: [] };
  const engineer = { roles: ['ENGINEER'], permissions: ['SR:UPDATE'] };
  const customer = { roles: ['CLIENT_ADMIN'], permissions: ['SR:UPDATE'] };

  it('접수·진행중·보류 상태에서 운영자는 조정할 수 있다', () => {
    for (const status of ['INTAKE', 'IN_PROGRESS', 'ON_HOLD']) {
      expect(canViewerAdjustDueDate(engineer, { status }), status).toBe(true);
      expect(canViewerAdjustDueDate(manager, { status }), status).toBe(true);
    }
  });

  it('접수 전과 종결 뒤에는 아무도 조정하지 않는다', () => {
    for (const status of ['REQUESTED', 'COMPLETED', 'CONFIRMED', 'REJECTED']) {
      expect(canViewerAdjustDueDate(manager, { status }), status).toBe(false);
    }
  });

  it('외부 사용자는 조정하지 않는다', () => {
    expect(canViewerAdjustDueDate(customer, { status: 'IN_PROGRESS' })).toBe(false);
  });

  it('한 번 완료된 SR 은 접수 권한자(ADMIN·MANAGER 또는 SR:INTAKE)만 조정한다', () => {
    const reopened = { status: 'IN_PROGRESS', wasCompleted: true };
    expect(canViewerAdjustDueDate(engineer, reopened)).toBe(false);
    expect(canViewerAdjustDueDate(manager, reopened)).toBe(true);
    expect(canViewerAdjustDueDate({ roles: ['ADMIN'] }, reopened)).toBe(true);
    // 역할별 권한은 ADMIN 이 조정하는 기본값이다(헌법 §1.4) — SR:INTAKE 를 받으면 조정할 수 있다.
    expect(canViewerAdjustDueDate({ roles: ['OPS'], permissions: ['SR:INTAKE'] }, reopened)).toBe(
      true
    );
  });
});

describe('canChangeSLABasisAt', () => {
  it('종결(완료·확인완료·거절)된 SR 은 SLA 근거를 바꾸지 않는다', () => {
    expect(canChangeSLABasisAt('COMPLETED')).toBe(false);
    expect(canChangeSLABasisAt('CONFIRMED')).toBe(false);
    expect(canChangeSLABasisAt('REJECTED')).toBe(false);
    expect(canChangeSLABasisAt('IN_PROGRESS')).toBe(true);
    expect(canChangeSLABasisAt('REQUESTED')).toBe(true);
  });
});

describe('한 번 완료된 SR 의 거절 금지', () => {
  it('isRejectBlockedAfterCompletion 은 서버가 채운 wasCompleted 만 본다', () => {
    expect(isRejectBlockedAfterCompletion({ wasCompleted: true })).toBe(true);
    expect(isRejectBlockedAfterCompletion({ wasCompleted: false })).toBe(false);
    expect(isRejectBlockedAfterCompletion(null)).toBe(false);
  });

  it('validateTransition 은 한 번 완료된 SR 의 보류 → 거절을 거부한다', () => {
    const result = validateTransition(
      'ON_HOLD',
      'REJECTED',
      ['MANAGER'],
      { wasCompleted: true },
      { rejectionReason: '범위 밖' },
      ['SR:STATUS_CHANGE']
    );
    expect(result).toEqual({ valid: false, message: SR_REJECT_AFTER_COMPLETION_MESSAGE });
  });

  it('대조군: 완료된 적 없는 SR 은 보류에서 거절할 수 있다', () => {
    const result = validateTransition(
      'ON_HOLD',
      'REJECTED',
      ['MANAGER'],
      { wasCompleted: false },
      { rejectionReason: '범위 밖' },
      ['SR:STATUS_CHANGE']
    );
    expect(result.valid).toBe(true);
  });
});
