import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('next-auth/react', () => ({ signOut: mocks.signOut }));
vi.mock('@/actions/user.actions', () => ({ revokeMySessionsAction: mocks.revoke }));

import { UserNav } from '../UserNav';

const user = { name: '사용자', email: 'user@example.com', image: null };

async function clickSignOut() {
  const actor = userEvent.setup();
  render(<UserNav user={user as never} />);
  await actor.click(screen.getByRole('button'));
  await actor.click(await screen.findByText('로그아웃'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue(undefined);
  mocks.revoke.mockResolvedValue({ success: true });
  vi.stubGlobal('location', { href: '/dashboard' });
});

describe('UserNav 로그아웃', () => {
  // 쿠키만 지우면 복사된 토큰이 수명이 끝날 때까지 살아 있다.
  it('세션을 서버에서 무효화한 뒤 로그아웃한다', async () => {
    await clickSignOut();

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    expect(mocks.revoke.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0]!
    );
  });

  it('무효화가 실패해도 이 기기는 로그아웃한다', async () => {
    mocks.revoke.mockRejectedValue(new Error('network'));

    await clickSignOut();

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
  });
});
