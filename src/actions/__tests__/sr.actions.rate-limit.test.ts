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

describe('update 와 delete 가 같은 버킷을 공유한다', () => {
  it('두 액션을 섞어 호출해도 합산 한도가 적용된다', async () => {
    const form = new FormData();
    form.set('title', '제목을 수정합니다');

    for (let i = 0; i < STRICT_LIMIT; i++) {
      // 액션을 번갈아 호출한다 — 액션별로 버킷이 갈리면 실효 한도가 2배가 된다.
      const result =
        i % 2 === 0 ? await updateSRAction('sr-1', form) : await deleteSRAction('sr-1');
      expect(result.success).toBe(true);
    }

    const overflow = await updateSRAction('sr-1', form);
    expect(overflow.success).toBe(false);
  });
});
