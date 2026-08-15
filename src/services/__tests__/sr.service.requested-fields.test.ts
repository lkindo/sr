import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '@/lib/prisma';
import { SRService } from '@/services/sr.service';

vi.mock('@/services/sr-email-outbox', () => ({
  enqueueSRCreatedEmails: vi.fn().mockResolvedValue(0),
  enqueueSRStatusChangedEmail: vi.fn().mockResolvedValue(0),
  enqueueSRAssignedEmail: vi.fn().mockResolvedValue(0),
}));

/**
 * 감사 3.27 회귀 테스트 — 희망 우선순위·희망 완료일이 DB 까지 도달하는가.
 *
 * `srUpdateSchema` 에 선언이 없어 zod 가 미지 키로 조용히 제거했고, 사용자는
 * "SR이 수정되었습니다" 성공 토스트를 받으면서도 값이 저장되지 않았다.
 * 다음에 다이얼로그를 열면 서버가 이전 값을 다시 채워 넣어, 사용자가 표명한
 * 긴급도와 기한이 **긍정 확인과 함께** 소실됐다.
 */

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn((cb: any) => cb(prisma)),
    // updateMany 는 낙관적 잠금 가드(스냅샷 이후 상태가 안 바뀌었을 때만 진행)에 쓰인다.
    sR: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    client: { findUnique: vi.fn() },
    serviceCategory: { findUnique: vi.fn() },
    sRActivity: { create: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    role: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return { ...actual, ensureCanUpdateSR: vi.fn(), ensureCanCreateSR: vi.fn() };
});

const EXISTING_SR = {
  id: 'sr-1',
  srNumber: 'SR-20260801-0001',
  title: '기존 제목',
  status: 'REQUESTED',
  clientId: 'c1',
  requesterId: 'u2',
  assigneeId: null,
  requestedPriority: 'MEDIUM',
  requestedCompletionDate: new Date('2026-08-10T00:00:00.000Z'),
  dueDate: null,
  actualPriority: null,
  estimatedHours: null,
  intakeNotes: null,
};

/** 요청자 본인(외부 사용자). 희망 필드는 이 사람이 소유한다. */
const requester = { id: 'u2', roles: ['CLIENT_USER'], permissions: [], clientIds: ['c1'] } as never;

describe('SRService.updateSR — 희망 우선순위·완료일', () => {
  let srService: SRService;

  const updateArgs = () => vi.mocked(prisma.sR.update).mock.calls[0]![0] as { data: any };

  beforeEach(() => {
    vi.clearAllMocks();
    srService = new SRService();
    vi.mocked(prisma.sR.findUnique).mockResolvedValue(EXISTING_SR as never);
    vi.mocked(prisma.sR.update).mockResolvedValue({ ...EXISTING_SR } as never);
    // 가드 통과(다른 사용자가 먼저 바꾸지 않음).
    vi.mocked(prisma.sR.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.role.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  });

  it('requestedPriority 를 DB 쓰기에 포함한다', async () => {
    await srService.updateSR('sr-1', { requestedPriority: 'CRITICAL' }, requester);

    expect(updateArgs().data.requestedPriority).toBe('CRITICAL');
  });

  it('requestedCompletionDate 를 Date 로 변환해 포함한다', async () => {
    await srService.updateSR('sr-1', { requestedCompletionDate: '2026-09-15' }, requester);

    const value = updateArgs().data.requestedCompletionDate;
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString()).toContain('2026-09-15');
  });

  it('빈 값이면 희망 완료일을 null 로 지운다', async () => {
    await srService.updateSR('sr-1', { requestedCompletionDate: '' }, requester);

    expect(updateArgs().data.requestedCompletionDate).toBeNull();
  });

  it('전달하지 않으면 두 필드를 건드리지 않는다', async () => {
    await srService.updateSR('sr-1', { title: '새 제목입니다' }, requester);

    const data = updateArgs().data;
    expect(data).not.toHaveProperty('requestedPriority');
    expect(data).not.toHaveProperty('requestedCompletionDate');
  });

  it('요청자 소유 필드이므로 외부 사용자도 변경할 수 있다', async () => {
    // 운영자 소유 필드(dueDate/actualPriority/assigneeId)와 달리 게이트되지 않아야 한다.
    // 게이트되면 고객이 자기 희망 기한조차 못 바꾼다.
    await expect(
      srService.updateSR(
        'sr-1',
        { requestedPriority: 'HIGH', requestedCompletionDate: '2026-09-20' },
        requester
      )
    ).resolves.toBeDefined();

    expect(updateArgs().data.requestedPriority).toBe('HIGH');
  });

  it('희망 필드 변경이 운영자 소유 필드를 함께 바꾸지는 않는다', async () => {
    await srService.updateSR('sr-1', { requestedCompletionDate: '2026-09-20' }, requester);

    const data = updateArgs().data;
    // 희망 완료일은 SLA 마감일(dueDate)이 아니다 — 둘을 섞으면 SLA 지표가 위조된다.
    expect(data).not.toHaveProperty('dueDate');
    expect(data).not.toHaveProperty('actualPriority');
  });
});
