import { describe, expect, it } from 'vitest';

import { validateTransition } from '../sr-state-machine';

/**
 * 감사 4.3 회귀 테스트 — 상태 전이 인가.
 *
 * 두 가지 결함이 있었다.
 *
 * 1. **fail-open**: 역할 검사가 `if (userRoles && userRoles.length > 0)` 로 감싸져 있어
 *    roles 가 빈 배열이면 블록 전체를 건너뛰고 `{ valid: true }` 로 떨어졌다.
 *    `src/auth.ts` 는 사용자 조회 실패 시 `token.roles = []` 로 세션을 만든다 —
 *    즉 인가 정보를 읽지 못한 세션이 모든 전이를 수행할 수 있었다.
 *
 * 2. **역할명 하드코딩**: 앱의 나머지 인가는 permission 기반인데 전이만 리터럴 역할명을
 *    썼다. 운영자가 `SR:UPDATE` + `SR:STATUS_CHANGE` 를 준 커스텀 역할은 `canUpdateSR` 은
 *    통과하지만 전이는 하나도 못 했다 — RBAC 화면이 쓸 수 없는 역할을 만들어 냈다.
 */

describe('validateTransition — fail-closed', () => {
  it('역할이 빈 배열이면 거부한다 (예전에는 통과했다)', () => {
    const r = validateTransition('REQUESTED', 'INTAKE', []);
    expect(r.valid).toBe(false);
  });

  it('역할이 undefined 여도 거부한다', () => {
    expect(validateTransition('REQUESTED', 'INTAKE', undefined).valid).toBe(false);
  });

  it('역할·권한이 모두 비어도 거부한다', () => {
    expect(validateTransition('IN_PROGRESS', 'COMPLETED', [], undefined, undefined, []).valid).toBe(
      false
    );
  });

  it('인가 정보가 없으면 어떤 전이도 통과시키지 않는다', () => {
    const edges: [string, string][] = [
      ['REQUESTED', 'INTAKE'],
      ['REQUESTED', 'REJECTED'],
      ['INTAKE', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'COMPLETED'],
      ['IN_PROGRESS', 'ON_HOLD'],
      ['ON_HOLD', 'IN_PROGRESS'],
      ['COMPLETED', 'CONFIRMED'],
      ['CONFIRMED', 'IN_PROGRESS'],
    ];

    for (const [from, to] of edges) {
      expect(
        validateTransition(from as never, to as never, [], undefined, undefined, []).valid,
        `${from} → ${to} 가 인가 없이 통과한다`
      ).toBe(false);
    }
  });
});

describe('validateTransition — 시드 역할 동작 보존', () => {
  it('MANAGER 는 접수할 수 있다', () => {
    expect(validateTransition('REQUESTED', 'INTAKE', ['MANAGER']).valid).toBe(true);
  });

  it('ENGINEER 는 진행 중으로 옮길 수 있다', () => {
    expect(
      validateTransition('INTAKE', 'IN_PROGRESS', ['ENGINEER'], { assigneeId: 'u1' }, {}).valid
    ).toBe(true);
  });

  it('CLIENT_USER 는 자기가 신청한 완료 SR 을 확인할 수 있다', () => {
    expect(
      validateTransition(
        'COMPLETED',
        'CONFIRMED',
        ['CLIENT_USER'],
        { requesterId: 'u1' },
        {},
        [],
        'u1'
      ).valid
    ).toBe(true);
  });

  /**
   * 확인 완료는 고객 인수 행위다. 역할만으로는 판정할 수 없다 —
   * TRANSITION_ROLES 는 'CLIENT_USER' 라는 역할을 허용할 뿐 "그 SR 의 신청자인가" 를 모른다.
   *
   * 이 검사가 없던 동안 PATCH /api/srs/[id] (srUpdateSchema 의 status)로 우회가 가능했다.
   * 실측: 상태 라우트는 403 인데 업데이트 라우트는 200 이었고, ADMIN 과 신청자가 아닌
   * CLIENT_ADMIN 이 남의 SR 을 CONFIRMED 로 종결시킬 수 있었다.
   */
  it('신청자가 아니면 역할이 허용돼도 확인할 수 없다', () => {
    // 같은 CLIENT_USER 역할이지만 신청자가 다르다
    expect(
      validateTransition(
        'COMPLETED',
        'CONFIRMED',
        ['CLIENT_USER'],
        { requesterId: 'u1' },
        {},
        [],
        'u2'
      ).valid
    ).toBe(false);
    // ADMIN 도 대신 눌러 줄 수 없다
    expect(
      validateTransition(
        'COMPLETED',
        'CONFIRMED',
        ['ADMIN'],
        { requesterId: 'u1' },
        {},
        [],
        'admin'
      ).valid
    ).toBe(false);
  });

  it('신원을 확인할 수 없으면 확인 완료를 거부한다 (fail-closed)', () => {
    // actorId 없음
    expect(
      validateTransition('COMPLETED', 'CONFIRMED', ['CLIENT_USER'], { requesterId: 'u1' }, {}).valid
    ).toBe(false);
    // currentData 없음
    expect(
      validateTransition('COMPLETED', 'CONFIRMED', ['CLIENT_USER'], undefined, undefined, [], 'u1')
        .valid
    ).toBe(false);
  });

  it('CLIENT_USER 는 접수할 수 없다', () => {
    expect(validateTransition('REQUESTED', 'INTAKE', ['CLIENT_USER']).valid).toBe(false);
  });
});

describe('validateTransition — 커스텀 역할(권한 경로)', () => {
  // 운영자가 RBAC 화면에서 만든 역할. 시드 역할명 어디에도 없다.
  const customRole = ['SUPPORT_LEAD'];

  it('SR:INTAKE 권한이 있으면 역할명이 없어도 접수할 수 있다', () => {
    const r = validateTransition('REQUESTED', 'INTAKE', customRole, undefined, undefined, [
      'SR:INTAKE',
    ]);
    expect(r.valid).toBe(true);
  });

  it('SR:STATUS_CHANGE 권한으로 진행 상태를 바꿀 수 있다', () => {
    expect(
      validateTransition('IN_PROGRESS', 'ON_HOLD', customRole, undefined, undefined, [
        'SR:STATUS_CHANGE',
      ]).valid
    ).toBe(true);
  });

  it('권한이 부족하면 여전히 거부한다', () => {
    // SR:STATUS_CHANGE 만으로는 접수(SR:INTAKE)를 할 수 없다.
    expect(
      validateTransition('REQUESTED', 'INTAKE', customRole, undefined, undefined, [
        'SR:STATUS_CHANGE',
      ]).valid
    ).toBe(false);
  });

  it('확인·재오픈은 SR:CONFIRM 을 요구한다 (운영자 권한과 구분)', () => {
    // 신청자 검사가 추가되면서 이 엣지는 "권한 + 신청자 본인" 을 모두 요구한다.
    // 권한만 확인하려면 신청자 조건을 만족시켜 두고 권한만 바꿔 가며 비교해야 한다.
    const own = { requesterId: 'u1' };
    expect(
      validateTransition('COMPLETED', 'CONFIRMED', customRole, own, {}, ['SR:STATUS_CHANGE'], 'u1')
        .valid
    ).toBe(false);
    expect(
      validateTransition('COMPLETED', 'CONFIRMED', customRole, own, {}, ['SR:CONFIRM'], 'u1').valid
    ).toBe(true);
  });

  it('SR:STATUS_CHANGE 만으로는 재오픈할 수 없다', () => {
    // 재오픈 엣지에 SR:STATUS_CHANGE 를 함께 두었더니, 그 권한을 보유한 시드 ENGINEER 가
    // TRANSITION_ROLES 의 제외를 권한 경로로 우회했다. 역할 표와 권한 표가 서로 다른 답을
    // 내면 어느 쪽이 진짜인지 알 수 없게 된다.
    const engineerSession = ['ENGINEER'];
    const engineerPermissions = ['SR:READ', 'SR:UPDATE', 'SR:STATUS_CHANGE', 'SR:INTAKE'];

    expect(
      validateTransition(
        'CONFIRMED',
        'IN_PROGRESS',
        engineerSession,
        undefined,
        undefined,
        engineerPermissions
      ).valid
    ).toBe(false);

    expect(
      validateTransition(
        'COMPLETED',
        'IN_PROGRESS',
        engineerSession,
        undefined,
        undefined,
        engineerPermissions
      ).valid
    ).toBe(false);

    // MANAGER 는 역할 경로로 통과한다 — 권한을 넓히지 않고도 소유자 결정이 지켜진다.
    expect(
      validateTransition('CONFIRMED', 'IN_PROGRESS', ['MANAGER'], undefined, undefined, [
        'SR:STATUS_CHANGE',
      ]).valid
    ).toBe(true);
  });

  it('권한 비교는 대소문자를 가리지 않는다', () => {
    expect(
      validateTransition('REQUESTED', 'INTAKE', customRole, undefined, undefined, ['sr:intake'])
        .valid
    ).toBe(true);
  });
});

describe('validateTransition — 흐름 자체가 불가능한 전이', () => {
  it('권한이 아무리 많아도 유효하지 않은 전이는 거부한다', () => {
    const r = validateTransition('REQUESTED', 'COMPLETED', ['ADMIN'], undefined, undefined, [
      'SR:INTAKE',
      'SR:STATUS_CHANGE',
      'SR:CONFIRM',
    ]);
    expect(r.valid).toBe(false);
    expect(r.message).toContain('전환할 수 없습니다');
  });

  it('REJECTED 는 terminal 이다', () => {
    expect(validateTransition('REJECTED', 'IN_PROGRESS', ['ADMIN']).valid).toBe(false);
  });
});

describe('validateTransition — 전이 맥락 규칙', () => {
  it('보류 전이는 사유가 필수다', () => {
    const current = { assigneeId: 'eng-1' };
    expect(validateTransition('IN_PROGRESS', 'ON_HOLD', ['ADMIN'], current, {}).valid).toBe(false);
    expect(
      validateTransition('IN_PROGRESS', 'ON_HOLD', ['ADMIN'], current, {
        changeReason: '고객 자료 대기',
      }).valid
    ).toBe(true);
  });

  it('재오픈은 사유가 필수다', () => {
    const current = { assigneeId: 'eng-1', completedAt: new Date() };
    const result = validateTransition('COMPLETED', 'IN_PROGRESS', ['ADMIN'], current, {});
    expect(result.valid).toBe(false);
    expect(result.message).toContain('재오픈 사유');
  });

  it('완료 후 7일이 지난 SR은 일반 서비스 경로에서도 재오픈할 수 없다', () => {
    const completedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const result = validateTransition(
      'COMPLETED',
      'IN_PROGRESS',
      ['ADMIN'],
      { assigneeId: 'eng-1', completedAt },
      { changeReason: '재작업' }
    );
    expect(result.valid).toBe(false);
    expect(result.message).toContain('7일');
  });

  it('완료 후 7일 이내에는 사유와 담당자가 있으면 재오픈할 수 있다', () => {
    const completedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(
      validateTransition(
        'COMPLETED',
        'IN_PROGRESS',
        ['ADMIN'],
        { assigneeId: 'eng-1', completedAt },
        { changeReason: '재작업' }
      ).valid
    ).toBe(true);
  });
});
