import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * VAPID 공개키 배포.
 *
 * 공개키는 노출돼도 안전하지만, **서버가 서명할 수 없는 키를 넘기는 것은 위험하다** —
 * 브라우저 구독은 성공하고 발송만 조용히 실패해서, 사용자는 알림을 켰다고 믿는다.
 * 그래서 설정이 없으면 키 대신 503 을 준다.
 */

const { mockIsConfigured, mockGetPublicKey } = vi.hoisted(() => ({
  mockIsConfigured: vi.fn(),
  mockGetPublicKey: vi.fn(),
}));

vi.mock('@/services/push.service', () => ({
  PushService: { isConfigured: mockIsConfigured, getPublicKey: mockGetPublicKey },
}));

import { GET } from '../route';

describe('GET /api/push/vapid-key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('설정되어 있으면 공개키를 준다', async () => {
    mockIsConfigured.mockReturnValue(true);
    mockGetPublicKey.mockReturnValue('BPublicKey');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.vapidPublicKey).toBe('BPublicKey');
  });

  // 200 에 빈 키를 실어 보내면 클라이언트가 "설정됨" 으로 진행한다.
  it('설정되어 있지 않으면 키 대신 503 을 준다', async () => {
    mockIsConfigured.mockReturnValue(false);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.vapidPublicKey).toBeUndefined();
    expect(mockGetPublicKey).not.toHaveBeenCalled();
  });
});
