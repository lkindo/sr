import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * 루트 레이아웃이 서버 세션을 `ClientLayout` 으로 흘려보내는지 고정한다.
 *
 * 이게 빠져 있으면 `SessionProvider` 가 초기 세션 없이 뜨고, 클라이언트는
 * `/api/auth/session` 이 돌아올 때까지 "로그인 안 한 사용자"로 렌더된다.
 * 눈에 보이는 증상은 ADMIN 인데도 상단 '조직 관리'·'권한 관리' 메뉴가 없는 것이었다.
 * 타입 검사로는 안 잡힌다 — `session` 이 선택적 prop 이라 안 넘겨도 컴파일된다.
 */

const auth = vi.hoisted(() => vi.fn());
const ClientLayoutStub = vi.hoisted(() => () => null);

vi.mock('@/auth', () => ({ auth }));

vi.mock('@/components/providers/ClientLayout', () => ({ default: ClientLayoutStub }));

// 루트 레이아웃이 끌고 오는 사이드이펙트들 — 세션 배선과 무관하다.
vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'font-inter', variable: '--font-inter' }),
  Geist: () => ({ className: 'font-geist', variable: '--font-geist' }),
  Geist_Mono: () => ({ className: 'font-geist-mono', variable: '--font-geist-mono' }),
}));

/** 서버 컴포넌트는 호출해도 자식이 실행되지 않는다 — 반환된 엘리먼트 트리를 직접 훑는다. */
const findElement = (node: unknown, type: unknown): { props: Record<string, unknown> } | null => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, type);
      if (hit) return hit;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node as { props: Record<string, unknown> };
  return findElement((node.props as { children?: unknown }).children, type);
};

describe('RootLayout 세션 배선', () => {
  it('auth() 결과를 ClientLayout 에 넘긴다', async () => {
    const session = { user: { id: 'u1', roles: ['ADMIN'] }, expires: '2099-01-01' };
    auth.mockResolvedValue(session);

    const { default: RootLayout } = await import('../layout');
    const tree = await RootLayout({ children: null });

    expect(auth).toHaveBeenCalled();

    const clientLayout = findElement(tree, ClientLayoutStub);
    expect(clientLayout, 'ClientLayout 을 트리에서 못 찾음').not.toBeNull();
    expect(clientLayout?.props.session).toBe(session);
  });
});
