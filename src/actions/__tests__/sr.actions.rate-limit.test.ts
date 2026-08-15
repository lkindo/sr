/**
 * 서버 액션 레이트리밋 회귀 테스트 (감사 4.3).
 *
 * `createSRAction` 에만 `requireRateLimit('strict')` 이 있었고
 * `updateSRAction` / `deleteSRAction` 에는 없었다. 대응 REST 라우트
 * (`PATCH`/`DELETE /api/srs/[id]`)는 둘 다 `{ preset: 'strict' }` 다.
 *
 * 서버 액션은 유효 세션 + `Next-Action` 헤더만으로 도달 가능한 공개 POST 이므로,
 * 액션 경로를 쓰면 REST 의 분당 5회 제한을 그대로 우회할 수 있었다. 담당자 변경마다
 * 대상에게 이메일 + 푸시가 발화하므로, 특정 내부 사용자를 겨냥한 무제한 알림 폭주가
 * 가능했다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/services/permission.service', () => ({
  PermissionService: class {
    requirePermission = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: { sRActivity: { findMany: vi.fn() }, sRComment: { findMany: vi.fn() } },
}));

const { mockSRService } = vi.hoisted(() => ({
  mockSRService: {
    createSR: vi.fn().mockResolvedValue({ id: 'sr-1' }),
    updateSR: vi.fn().mockResolvedValue({ id: 'sr-1' }),
    deleteSR: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/sr.service', () => ({
  SRService: vi.fn(),
  srService: mockSRService,
}));

import { auth } from '@/auth';
import { rateLimiters, RateLimitPresets } from '@/lib/rate-limiter';

import { deleteSRAction, updateSRAction } from '../sr.actions';

const session = {
  user: { id: 'user-1', name: 'U', roles: ['ADMIN'], permissions: [], clientIds: [] },
  expires: '2099-01-01',
};

/** strict 프리셋이 허용하는 호출 수. 하드코딩하지 않고 실제 설정에서 읽는다. */
const STRICT_LIMIT = RateLimitPresets.STRICT.maxRequests;

beforeEach(async () => {
  vi.clearAllMocks();
  await rateLimiters.strict.resetAll();
  vi.mocked(auth).mockResolvedValue(session as never);
});

describe('updateSRAction — strict 레이트리밋', () => {
  it(`${STRICT_LIMIT + 1}번째 호출부터 429 로 거부한다`, async () => {
    const form = new FormData();
    form.set('title', '제목을 수정합니다');

    for (let i = 0; i < STRICT_LIMIT; i++) {
      const result = await updateSRAction('sr-1', form);
      expect(result.success, `호출 ${i + 1}회차는 통과해야 한다`).toBe(true);
    }

    const overflow = await updateSRAction('sr-1', form);

    expect(overflow.success).toBe(false);
    expect(overflow.success === false && overflow.code).toBe('TOO_MANY_REQUESTS');
  });

  it('제한에 걸리면 서비스 레이어를 호출하지 않는다', async () => {
    const form = new FormData();
    form.set('title', '제목을 수정합니다');

    for (let i = 0; i < STRICT_LIMIT; i++) {
      await updateSRAction('sr-1', form);
    }
    mockSRService.updateSR.mockClear();

    await updateSRAction('sr-1', form);

    // 제한이 서비스 호출 **앞**에 있어야 실제 보호가 된다.
    expect(mockSRService.updateSR).not.toHaveBeenCalled();
  });
});

describe('deleteSRAction — strict 레이트리밋', () => {
  it(`${STRICT_LIMIT + 1}번째 호출부터 429 로 거부한다`, async () => {
    for (let i = 0; i < STRICT_LIMIT; i++) {
      const result = await deleteSRAction(`sr-${i}`);
      expect(result.success, `호출 ${i + 1}회차는 통과해야 한다`).toBe(true);
    }

    const overflow = await deleteSRAction('sr-overflow');

    expect(overflow.success).toBe(false);
    expect(overflow.success === false && overflow.code).toBe('TOO_MANY_REQUESTS');
    expect(mockSRService.deleteSR).toHaveBeenCalledTimes(STRICT_LIMIT);
  });
});

/**
 * 감사 D-15 — 액션별 버킷과 IP 천장의 2층 구조.
 *
 * 예전에는 모든 서버 액션이 `strict` 버킷 **하나**를 IP 로만 키잉해 공유했다.
 * 그래서 ① NAT 뒤 사무실 전체가 분당 5회를 나눠 쓰고 ② SR 등록을 몇 번 하면
 * 삭제·수정까지 함께 잠겼다. 반대로 버킷을 액션별로 나누기만 하면 실효 한도가
 * 액션 수만큼 곱해진다.
 *
 * 그래서 두 층으로 둔다:
 *   - 주 버킷(액션 × 주체): 정상 업무가 서로를 막지 않는다.
 *   - IP 천장(전 액션 공유): 한 발신지의 총량은 여전히 유한하다.
 */
describe('액션별 버킷 분리', () => {
  it('한 액션의 한도 소진이 다른 액션을 잠그지 않는다', async () => {
    const form = new FormData();
    form.set('title', '제목을 수정합니다');

    // update 를 한도까지 소진시킨다.
    for (let i = 0; i < STRICT_LIMIT; i++) {
      expect((await updateSRAction('sr-1', form)).success).toBe(true);
    }
    expect((await updateSRAction('sr-1', form)).success).toBe(false);

    // delete 는 자기 버킷을 갖고 있으므로 여전히 통과해야 한다.
    // (예전에는 여기서 429 가 났다 — 수정 몇 번에 삭제까지 막혔다는 뜻이다.)
    expect((await deleteSRAction('sr-1')).success).toBe(true);
  });
});
