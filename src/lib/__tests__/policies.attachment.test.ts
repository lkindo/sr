/**
 * 첨부 업로드 인가 회귀 테스트 (감사 4.1).
 *
 * 예전 상태:
 *   - 두 업로드 경로가 `ensureCanReadSR` 로 게이트됐다 → **읽기 권한으로 쓰기**가 가능.
 *   - `sr.status` 를 보지 않았다 → 완료/확정/반려된 SR 에도 첨부가 붙었다.
 *   - 반면 삭제는 `ensureCanUpdateSR` 을 요구 → 자기가 올린 것을 자기가 못 지우는 비대칭.
 */
import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/permission-helpers';
import { ensureCanAttachToSR, ensureCanDeleteAttachment } from '@/lib/policies';
import type { AuthenticatedUser } from '@/types/session';

const sr = {
  id: 'sr-1',
  clientId: 'client-A',
  requesterId: 'user-requester',
  assigneeId: 'user-engineer',
  status: 'IN_PROGRESS',
};

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'u@corp.com',
    name: 'U',
    image: null,
    roles: ['CLIENT_USER'],
    permissions: [],
    clientIds: ['client-A'],
    ...overrides,
  } as AuthenticatedUser;
}

describe('ensureCanAttachToSR — 쓰기 권한을 요구한다', () => {
  it('읽기 권한만 있으면 거부한다', () => {
    const readOnly = user({ permissions: [PERMISSIONS.SR.READ] });

    // 이것이 이 수정의 핵심이다. 예전에는 `ensureCanReadSR` 이라 통과했다.
    expect(() => ensureCanAttachToSR(readOnly, sr)).toThrow(ForbiddenError);
  });

  it('수정 권한과 ATTACHMENT:CREATE 가 있고 소속 테넌트면 허용한다', () => {
    const editor = user({
      permissions: [PERMISSIONS.SR.UPDATE, PERMISSIONS.ATTACHMENT.CREATE],
    });

    expect(() => ensureCanAttachToSR(editor, sr)).not.toThrow();
  });

  it('SR 수정은 되지만 ATTACHMENT:CREATE 가 없으면 거부한다', () => {
    // 이 권한은 카탈로그에 있고 다섯 역할 모두에 부여되지만 어디서도 검사되지
    // 않았다(감사 4.1) — 회수해도 아무 일도 일어나지 않는 통제였다.
    const noAttach = user({ permissions: [PERMISSIONS.SR.UPDATE] });

    expect(() => ensureCanAttachToSR(noAttach, sr)).toThrow(/첨부파일 업로드 권한/);
  });

  it('수정 권한이 있어도 다른 테넌트면 거부한다', () => {
    const outsider = user({
      permissions: [PERMISSIONS.SR.UPDATE, PERMISSIONS.ATTACHMENT.CREATE],
      clientIds: ['client-B'],
    });

    expect(() => ensureCanAttachToSR(outsider, sr)).toThrow(ForbiddenError);
  });

  it('ADMIN 은 허용한다', () => {
    expect(() => ensureCanAttachToSR(user({ roles: ['ADMIN'] }), sr)).not.toThrow();
  });
});

describe('ensureCanAttachToSR — 종결된 SR 을 막는다', () => {
  const admin = user({ roles: ['ADMIN'] });

  it.each(['COMPLETED', 'CONFIRMED', 'REJECTED'])('%s 상태에는 첨부할 수 없다', (status) => {
    // 종결 레코드는 감사 추적 대상이다. ADMIN 도 예외가 아니다 —
    // 필요하면 SR 을 다시 열고 붙이면 되고, 그 재오픈은 이력에 남는다.
    expect(() => ensureCanAttachToSR(admin, { ...sr, status })).toThrow(ForbiddenError);
  });

  it.each(['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD'])(
    '%s 상태에는 첨부할 수 있다',
    (status) => {
      expect(() => ensureCanAttachToSR(admin, { ...sr, status })).not.toThrow();
    }
  );

  it('권한 검사가 상태 검사보다 먼저다', () => {
    // 권한 없는 사용자에게 "종결된 SR 입니다" 라고 알려 주면
    // 존재 여부와 상태를 확인해 주는 오라클이 된다.
    const outsider = user({ permissions: [], clientIds: ['client-B'] });

    expect(() => ensureCanAttachToSR(outsider, { ...sr, status: 'COMPLETED' })).toThrow(
      /권한이 없습니다/
    );
  });
});

/**
 * 첨부 **삭제** 인가 (감사 D-20).
 *
 * 이 술어에는 테스트가 하나도 없었다. 그런데 `status` 가 선택적 필드라,
 * 호출부가 `select` 로 조회 필드를 좁히는 순간 **타입 오류 없이** `undefined` 가 들어와
 * 아래 "요청자 본인 + REQUESTED" 분기가 영원히 거짓이 됐다 — 요청자가 자기 SR 의
 * 첨부를 지울 수 없게 되는데, 어떤 테스트도 그걸 잡지 못했다.
 *
 * `status` 를 필수로 바꿔 컴파일 타임에 막았고, 동작 자체는 여기서 고정한다.
 */
describe('ensureCanDeleteAttachment', () => {
  const requester = () =>
    user({
      id: 'user-requester',
      permissions: [PERMISSIONS.SR.UPDATE_SELF, PERMISSIONS.SR.READ],
    });

  it('요청자 본인은 접수 전(REQUESTED) 자기 SR 의 첨부를 지울 수 있다', () => {
    expect(() =>
      ensureCanDeleteAttachment(requester(), { ...sr, status: 'REQUESTED' })
    ).not.toThrow();
  });

  it('접수된 뒤에는 요청자라도 지울 수 없다', () => {
    // 접수 이후의 첨부는 처리 이력의 일부다.
    expect(() => ensureCanDeleteAttachment(requester(), { ...sr, status: 'INTAKE' })).toThrow(
      ForbiddenError
    );
  });

  it('ADMIN 은 상태와 무관하게 지울 수 있다', () => {
    const admin = user({ id: 'admin-1', roles: ['ADMIN'] });

    expect(() => ensureCanDeleteAttachment(admin, { ...sr, status: 'COMPLETED' })).not.toThrow();
  });

  it('타 테넌트 사용자는 지울 수 없다', () => {
    const outsider = user({
      id: 'user-requester',
      clientIds: ['client-B'],
      permissions: [PERMISSIONS.SR.UPDATE_SELF],
    });

    expect(() => ensureCanDeleteAttachment(outsider, { ...sr, status: 'REQUESTED' })).toThrow(
      ForbiddenError
    );
  });

  it('요청자가 아닌 같은 고객사 사용자는 지울 수 없다', () => {
    const other = user({ id: 'user-other', permissions: [PERMISSIONS.SR.UPDATE_SELF] });

    expect(() => ensureCanDeleteAttachment(other, { ...sr, status: 'REQUESTED' })).toThrow(
      ForbiddenError
    );
  });
});
