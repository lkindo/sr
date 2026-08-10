import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionGuard } from '../PermissionGuard';

/**
 * PermissionGuard 는 순수한 판정 사다리다: role → roles → resource+action → permissions →
 * (아무 조건 없음). 어떤 가지를 타느냐에 따라 **다른 훅 함수**가 불리고, 나머지는 아예
 * 불리면 안 된다. 그래서 "무엇이 보이는가" 만이 아니라 "무엇을 물어봤는가" 까지 단언한다.
 * 사다리의 순서가 바뀌면(예: role 보다 resource 를 먼저 보면) 그 단언이 깨진다.
 *
 * 훅 하나만 대역으로 바꾸면 컴포넌트의 모든 분기를 결정론적으로 태울 수 있다 —
 * 세션을 조립할 필요가 없다.
 */

const permissionsApi = vi.hoisted(() => ({
  hasPermission: vi.fn<(resource: string, action: string) => boolean>(),
  hasAnyPermission: vi.fn<(perms: Array<{ resource: string; action: string }>) => boolean>(),
  hasAllPermissions: vi.fn<(perms: Array<{ resource: string; action: string }>) => boolean>(),
  hasRole: vi.fn<(role: string) => boolean>(),
  hasAnyRole: vi.fn<(roles: string[]) => boolean>(),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => permissionsApi,
}));

const CHILD = '보호된 내용';
const FALLBACK = '접근 불가';

const child = <span>{CHILD}</span>;

const seeChild = () => screen.queryByText(CHILD) !== null;
const seeFallback = () => screen.queryByText(FALLBACK) !== null;

beforeEach(() => {
  vi.clearAllMocks();
  // 기본값을 "전부 거부" 로 두어, 통과한 테스트가 어느 함수의 결과로 통과했는지 모호해지지
  // 않게 한다. 허용이 필요한 테스트만 자기 함수를 명시적으로 켠다.
  permissionsApi.hasPermission.mockReturnValue(false);
  permissionsApi.hasAnyPermission.mockReturnValue(false);
  permissionsApi.hasAllPermissions.mockReturnValue(false);
  permissionsApi.hasRole.mockReturnValue(false);
  permissionsApi.hasAnyRole.mockReturnValue(false);
});

describe('PermissionGuard - role 단일 역할 가지', () => {
  it('역할을 가지고 있으면 children 을 그린다', () => {
    permissionsApi.hasRole.mockReturnValue(true);

    render(<PermissionGuard role="ADMIN">{child}</PermissionGuard>);

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasRole).toHaveBeenCalledWith('ADMIN');
  });

  it('역할이 없으면 children 을 감춘다 (fallback 기본값 null)', () => {
    permissionsApi.hasRole.mockReturnValue(false);

    const { container } = render(<PermissionGuard role="ADMIN">{child}</PermissionGuard>);

    expect(seeChild()).toBe(false);
    // fallback 기본값이 null 이므로 아무것도 남지 않아야 한다.
    expect(container).toBeEmptyDOMElement();
  });

  it('역할이 없고 fallback 이 주어지면 fallback 을 그린다', () => {
    permissionsApi.hasRole.mockReturnValue(false);

    render(
      <PermissionGuard role="ADMIN" fallback={<span>{FALLBACK}</span>}>
        {child}
      </PermissionGuard>
    );

    expect(seeChild()).toBe(false);
    expect(seeFallback()).toBe(true);
  });

  it('role 이 있으면 resource/action 과 permissions 는 아예 보지 않는다', () => {
    permissionsApi.hasRole.mockReturnValue(false);
    permissionsApi.hasPermission.mockReturnValue(true);
    permissionsApi.hasAnyPermission.mockReturnValue(true);

    render(
      <PermissionGuard
        role="ADMIN"
        resource="SR"
        action="READ"
        permissions={[{ resource: 'SR', action: 'READ' }]}
      >
        {child}
      </PermissionGuard>
    );

    // 사다리의 첫 칸에서 끝나야 한다 — 아래 칸이 true 여도 막혀 있어야 한다.
    expect(seeChild()).toBe(false);
    expect(permissionsApi.hasPermission).not.toHaveBeenCalled();
    expect(permissionsApi.hasAnyPermission).not.toHaveBeenCalled();
  });
});

describe('PermissionGuard - roles 다중 역할 가지', () => {
  it('roles 중 하나라도 가지고 있으면 통과한다', () => {
    permissionsApi.hasAnyRole.mockReturnValue(true);

    render(<PermissionGuard roles={['ADMIN', 'MANAGER']}>{child}</PermissionGuard>);

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasAnyRole).toHaveBeenCalledWith(['ADMIN', 'MANAGER']);
    expect(permissionsApi.hasRole).not.toHaveBeenCalled();
  });

  it('roles 를 하나도 못 가지면 막는다', () => {
    permissionsApi.hasAnyRole.mockReturnValue(false);

    render(
      <PermissionGuard roles={['ADMIN', 'MANAGER']} fallback={<span>{FALLBACK}</span>}>
        {child}
      </PermissionGuard>
    );

    expect(seeChild()).toBe(false);
    expect(seeFallback()).toBe(true);
  });

  it('roles 가 빈 배열이면 역할 가지를 건너뛰고 다음 칸(resource+action)으로 내려간다', () => {
    permissionsApi.hasPermission.mockReturnValue(true);

    render(
      <PermissionGuard roles={[]} resource="SR" action="READ">
        {child}
      </PermissionGuard>
    );

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasAnyRole).not.toHaveBeenCalled();
    expect(permissionsApi.hasPermission).toHaveBeenCalledWith('SR', 'READ');
  });

  it('roles 가 빈 배열이고 다른 조건도 없으면 무조건 허용으로 떨어진다', () => {
    render(<PermissionGuard roles={[]}>{child}</PermissionGuard>);

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasAnyRole).not.toHaveBeenCalled();
  });
});

describe('PermissionGuard - resource + action 가지', () => {
  it.each([
    [true, true],
    [false, false],
  ])('hasPermission=%s 이면 노출=%s', (granted, visible) => {
    permissionsApi.hasPermission.mockReturnValue(granted);

    render(
      <PermissionGuard resource="SR" action="READ" fallback={<span>{FALLBACK}</span>}>
        {child}
      </PermissionGuard>
    );

    expect(seeChild()).toBe(visible);
    expect(seeFallback()).toBe(!visible);
    expect(permissionsApi.hasPermission).toHaveBeenCalledWith('SR', 'READ');
  });

  it('resource 만 있고 action 이 없으면 권한 가지가 아니라 permissions 가지로 내려간다', () => {
    permissionsApi.hasAnyPermission.mockReturnValue(true);

    render(
      <PermissionGuard resource="SR" permissions={[{ resource: 'SR', action: 'READ' }]}>
        {child}
      </PermissionGuard>
    );

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasPermission).not.toHaveBeenCalled();
    expect(permissionsApi.hasAnyPermission).toHaveBeenCalled();
  });

  it('action 만 있고 resource 가 없으면 조건이 없는 것으로 보아 허용한다', () => {
    render(<PermissionGuard action="READ">{child}</PermissionGuard>);

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasPermission).not.toHaveBeenCalled();
  });
});

describe('PermissionGuard - permissions + requireAll 가지', () => {
  const twoPermissions = [
    { resource: 'SR', action: 'READ' },
    { resource: 'SR', action: 'UPDATE' },
  ];

  it('requireAll 을 주지 않으면 기본값 false — any 로 판정한다', () => {
    permissionsApi.hasAnyPermission.mockReturnValue(true);
    permissionsApi.hasAllPermissions.mockReturnValue(false);

    render(<PermissionGuard permissions={twoPermissions}>{child}</PermissionGuard>);

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasAnyPermission).toHaveBeenCalledWith(twoPermissions);
    expect(permissionsApi.hasAllPermissions).not.toHaveBeenCalled();
  });

  it('requireAll=true 면 all 로 판정한다 — any 가 true 여도 all 이 false 면 막힌다', () => {
    permissionsApi.hasAnyPermission.mockReturnValue(true);
    permissionsApi.hasAllPermissions.mockReturnValue(false);

    render(
      <PermissionGuard permissions={twoPermissions} requireAll fallback={<span>{FALLBACK}</span>}>
        {child}
      </PermissionGuard>
    );

    expect(seeChild()).toBe(false);
    expect(seeFallback()).toBe(true);
    expect(permissionsApi.hasAllPermissions).toHaveBeenCalledWith(twoPermissions);
    expect(permissionsApi.hasAnyPermission).not.toHaveBeenCalled();
  });

  it('requireAll=true 이고 all 이 true 면 통과한다', () => {
    permissionsApi.hasAllPermissions.mockReturnValue(true);

    render(
      <PermissionGuard permissions={twoPermissions} requireAll>
        {child}
      </PermissionGuard>
    );

    expect(seeChild()).toBe(true);
  });

  it('requireAll=false 이고 any 도 false 면 막힌다', () => {
    permissionsApi.hasAnyPermission.mockReturnValue(false);

    render(
      <PermissionGuard permissions={twoPermissions} requireAll={false}>
        {child}
      </PermissionGuard>
    );

    expect(seeChild()).toBe(false);
  });

  it('permissions 가 빈 배열이면 조건 없음으로 보아 허용한다', () => {
    permissionsApi.hasAnyPermission.mockReturnValue(false);

    render(<PermissionGuard permissions={[]}>{child}</PermissionGuard>);

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasAnyPermission).not.toHaveBeenCalled();
  });
});

describe('PermissionGuard - 조건이 아예 없는 경우', () => {
  it('아무 prop 도 없으면 통과시킨다', () => {
    render(<PermissionGuard>{child}</PermissionGuard>);

    expect(seeChild()).toBe(true);
    expect(permissionsApi.hasRole).not.toHaveBeenCalled();
    expect(permissionsApi.hasAnyRole).not.toHaveBeenCalled();
    expect(permissionsApi.hasPermission).not.toHaveBeenCalled();
    expect(permissionsApi.hasAnyPermission).not.toHaveBeenCalled();
    expect(permissionsApi.hasAllPermissions).not.toHaveBeenCalled();
  });

  it('조건이 없으면 fallback 이 있어도 children 이 이긴다', () => {
    render(<PermissionGuard fallback={<span>{FALLBACK}</span>}>{child}</PermissionGuard>);

    expect(seeChild()).toBe(true);
    expect(seeFallback()).toBe(false);
  });
});
