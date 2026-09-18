import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SRService } from '@/services/sr.service';

/**
 * 마감일 수동 조정 (헌법 §3, 소유자 결정 2026-09-18 D8).
 *
 * 헌법은 이 규칙을 "✅ 준수"로 표시해 두었지만 실제로는 셋 다 지켜지지 않았다.
 *  1. 수동 여부를 저장하지 않아 **다음 우선순위·카테고리 변경 때 자동 재산출이 덮어썼다**
 *     ("이번 요청에 dueDate 가 있었는가" 로만 판정했다).
 *  2. 마감일을 **비울 수 있었고**, 비우면 준수율의 분모·분자에서 모두 빠졌다 — 지연된 SR 을 지표에서
 *     치울 수 있었다.
 *  3. 조정 사유가 필수가 아니었다.
 * 지금은 due_date_manual 표식을 남기고, 비우기를 거부하고, 사유를 요구한다. 사유는 SR_DUE_DATE
 * 감사 로그에 남는다.
 */

vi.mock('@/services/sr-email-outbox', () => ({
  enqueueSRCreatedEmails: vi.fn().mockResolvedValue(0),
  enqueueSRStatusChangedEmail: vi.fn().mockResolvedValue(0),
  enqueueSRAssignedEmail: vi.fn().mockResolvedValue(0),
}));

const { mockPrisma, calculateDueDate } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    sR: { findUnique: vi.fn() },
    serviceCategory: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    // 한 번 완료된 적 있는가(D9 — sr.service.wasEverCompleted). 기본은 없음.
    sRStatusHistory: { findFirst: vi.fn() },
  },
  calculateDueDate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

// 이 스위트가 보는 것은 마감일 규칙이다. SR 단위 인가(ensureCanUpdateSR)만 스텁하고 운영자 필드 규칙은
// 실물을 둔다 — 누가 마감일을 바꿀 수 있는지는 그 규칙이 정한다.
vi.mock('@/lib/policies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/policies')>()),
  ensureCanUpdateSR: vi.fn(),
}));

vi.mock('@/services/service-category.service', () => ({
  serviceCategoryService: { calculateDueDate },
}));

vi.mock('@/services/push.service', () => ({
  pushService: { sendToUser: vi.fn(), sendToUsers: vi.fn() },
}));

const manager = {
  id: 'mgr-1',
  email: 'mgr@example.com',
  name: 'Manager',
  image: null,
  roles: ['MANAGER'],
  permissions: ['SR:UPDATE', 'SR:ASSIGN'],
  clientIds: [],
};

const AUTO_DUE = new Date('2026-09-20T03:00:00.000Z');
const RECALCULATED = new Date('2026-09-19T03:00:00.000Z');

const baseSR = {
  id: 'sr-1',
  srNumber: 'SR-001',
  title: '제목',
  status: 'IN_PROGRESS',
  clientId: 'c-1',
  requesterId: 'req-1',
  assigneeId: 'eng-1',
  serviceCategoryId: 'cat-1',
  actualPriority: 'MEDIUM',
  intakeAt: new Date('2026-09-18T00:00:00.000Z'),
  dueDate: AUTO_DUE,
  dueDateManual: false,
  version: 3,
};

let tx: {
  sR: { updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
  sRActivity: { create: ReturnType<typeof vi.fn> };
};

const srService = new SRService();
const updateData = () => tx.sR.update.mock.calls[0]![0].data;
const dueDateAudits = () =>
  tx.auditLog.create.mock.calls
    .map((call) => call[0].data)
    .filter((data) => data.targetEntity === 'SR_DUE_DATE');

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.sR.findUnique.mockResolvedValue({ ...baseSR });
  mockPrisma.sRStatusHistory.findFirst.mockResolvedValue(null);
  calculateDueDate.mockResolvedValue(RECALCULATED);
  tx = {
    sR: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...baseSR, ...data })),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    sRActivity: { create: vi.fn().mockResolvedValue({}) },
  };
  mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));
});

describe('마감일 직접 조정', () => {
  it('사유와 함께 바꾸면 저장하고 수동 표식을 세우며, 사유를 감사 로그에 남긴다', async () => {
    await srService.updateSR(
      'sr-1',
      { dueDate: '2026-09-25T09:00:00.000Z', changeReason: '고객과 일정 협의' },
      manager
    );

    expect(updateData().dueDate).toEqual(new Date('2026-09-25T09:00:00.000Z'));
    expect(updateData().dueDateManual).toBe(true);
    expect(dueDateAudits()).toEqual([
      expect.objectContaining({
        changes: expect.objectContaining({
          before: AUTO_DUE.toISOString(),
          reason: '고객과 일정 협의',
        }),
      }),
    ]);
  });

  it.each([
    ['사유 없음', {}],
    ['공백 사유', { changeReason: '   ' }],
  ])('%s 이면 거부하고 아무것도 쓰지 않는다', async (_label, extra) => {
    await expect(
      srService.updateSR('sr-1', { dueDate: '2026-09-25T09:00:00.000Z', ...extra }, manager)
    ).rejects.toThrow('마감일을 직접 조정할 때는 조정 사유를 입력해야 합니다.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('마감일을 비우는 조작은 사유가 있어도 거부한다(준수율 분모에서 빠지는 구멍)', async () => {
    await expect(
      srService.updateSR('sr-1', { dueDate: null, changeReason: '지표에서 빼기' }, manager)
    ).rejects.toThrow('마감일은 비울 수 없습니다.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('형식이 잘못된 날짜는 거부한다', async () => {
    await expect(
      srService.updateSR('sr-1', { dueDate: '내일 오후', changeReason: '사유' }, manager)
    ).rejects.toThrow('마감일 형식이 올바르지 않습니다.');
  });

  it('같은 마감일을 다시 보내면(수정 폼 재전송) 조정으로 세지 않는다 — 표식도 감사 로그도 없다', async () => {
    await srService.updateSR(
      'sr-1',
      { dueDate: AUTO_DUE.toISOString(), title: '제목만 고침' },
      manager
    );

    expect(updateData().title).toBe('제목만 고침');
    expect(updateData()).not.toHaveProperty('dueDateManual');
    expect(updateData()).not.toHaveProperty('dueDate');
    expect(dueDateAudits()).toEqual([]);
  });

  it('외부 사용자는 사유가 있어도 마감일을 바꿀 수 없다(운영자 소유 값)', async () => {
    const customer = {
      id: 'req-1',
      email: 'c@example.com',
      name: null,
      image: null,
      roles: ['CLIENT_ADMIN'],
      permissions: ['SR:UPDATE'],
      clientIds: ['c-1'],
    };

    await expect(
      srService.updateSR(
        'sr-1',
        { dueDate: '2026-09-25T09:00:00.000Z', changeReason: '당겨 주세요' },
        customer
      )
    ).rejects.toThrow('접수 담당자만 변경할 수 있는 항목입니다');
  });
});

describe('수동 지정된 마감일과 자동 재산출', () => {
  it('수동 지정된 SR 은 우선순위가 바뀌어도 마감일을 다시 계산하지 않는다', async () => {
    mockPrisma.sR.findUnique.mockResolvedValue({ ...baseSR, dueDateManual: true });

    await srService.updateSR('sr-1', { actualPriority: 'CRITICAL' }, manager);

    expect(calculateDueDate).not.toHaveBeenCalled();
    expect(updateData()).not.toHaveProperty('dueDate');
  });

  it('수동 지정된 SR 은 카테고리가 바뀌어도 마감일을 다시 계산하지 않는다', async () => {
    mockPrisma.sR.findUnique.mockResolvedValue({ ...baseSR, dueDateManual: true });
    mockPrisma.serviceCategory.findUnique.mockResolvedValue({ id: 'cat-2', clientId: null });

    await srService.updateSR('sr-1', { serviceCategoryId: 'cat-2' }, manager);

    expect(calculateDueDate).not.toHaveBeenCalled();
    expect(updateData()).not.toHaveProperty('dueDate');
  });

  it('대조군: 자동 산출 마감일은 우선순위가 바뀌면 다시 계산한다', async () => {
    await srService.updateSR('sr-1', { actualPriority: 'CRITICAL' }, manager);

    expect(calculateDueDate).toHaveBeenCalledWith('cat-1', 'CRITICAL', baseSR.intakeAt);
    expect(updateData().dueDate).toBe(RECALCULATED);
    expect(updateData()).not.toHaveProperty('dueDateManual');
  });
});

/**
 * 한 번 완료된 SR 의 마감일(헌법 §2, 2026-09-18 소유자 결정 D9).
 *
 * 예전에는 완료·재오픈된 SR 의 카테고리나 우선순위만 바꿔도 마감일이 사유·기록 없이 다시 계산돼
 * 위반을 준수로 소급해 바꿀 수 있었고, 재작업 당사자(배정 ENGINEER)가 사유 한 줄로 자기 마감일을
 * 미룰 수 있었고, 재오픈 → 보류 → 거절로 끝내면 준수율 표본에서 빠졌다.
 */
describe('한 번 완료된 SR 의 마감일(D9)', () => {
  const engineer = {
    id: 'eng-1',
    email: 'eng@example.com',
    name: 'Engineer',
    image: null,
    roles: ['ENGINEER'],
    permissions: ['SR:UPDATE'],
    clientIds: [],
  };
  const reopened = { ...baseSR, completedAt: new Date('2026-09-18T10:00:00.000Z') };

  it('종결된 SR 은 마감일·카테고리·실제 우선순위를 바꿀 수 없다', async () => {
    mockPrisma.sR.findUnique.mockResolvedValue({ ...reopened, status: 'COMPLETED' });
    mockPrisma.serviceCategory.findUnique.mockResolvedValue({ id: 'cat-2', clientId: null });

    for (const change of [
      { dueDate: '2026-09-25T09:00:00.000Z', changeReason: '사유' },
      { serviceCategoryId: 'cat-2' },
      { actualPriority: 'LOW' as const },
    ]) {
      await expect(srService.updateSR('sr-1', change, manager)).rejects.toThrow(
        '종결된 SR의 마감일·서비스 카테고리·실제 우선순위는 바꿀 수 없습니다.'
      );
    }
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('재오픈된 SR 은 카테고리·우선순위가 바뀌어도 최초 마감일을 유지한다', async () => {
    mockPrisma.sR.findUnique.mockResolvedValue({ ...reopened });

    await srService.updateSR('sr-1', { actualPriority: 'LOW' }, manager);

    expect(calculateDueDate).not.toHaveBeenCalled();
    expect(updateData()).not.toHaveProperty('dueDate');
    expect(updateData().actualPriority).toBe('LOW');
  });

  it('완료 시각이 비어 있는 옛 SR 도 상태 이력으로 완료 여부를 판정한다', async () => {
    mockPrisma.sRStatusHistory.findFirst.mockResolvedValue({ id: 'h-1' });

    await srService.updateSR('sr-1', { actualPriority: 'LOW' }, manager);

    expect(mockPrisma.sRStatusHistory.findFirst).toHaveBeenCalledWith({
      where: { srId: 'sr-1', currentStatus: 'COMPLETED' },
      select: { id: true },
    });
    expect(calculateDueDate).not.toHaveBeenCalled();
  });

  it('재작업 당사자(배정 ENGINEER)는 재오픈된 SR 의 마감일을 조정할 수 없다', async () => {
    mockPrisma.sR.findUnique.mockResolvedValue({ ...reopened });

    await expect(
      srService.updateSR(
        'sr-1',
        { dueDate: '2026-09-30T09:00:00.000Z', changeReason: '시간이 더 필요' },
        engineer
      )
    ).rejects.toThrow(
      '한 번 완료된 SR의 마감일은 운영 관리자(ADMIN·MANAGER)만 조정할 수 있습니다.'
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('대조군: 한 번도 완료되지 않은 SR 은 배정 ENGINEER 도 사유와 함께 조정할 수 있다', async () => {
    await srService.updateSR(
      'sr-1',
      { dueDate: '2026-09-30T09:00:00.000Z', changeReason: '고객과 일정 협의' },
      engineer
    );

    expect(updateData().dueDate).toEqual(new Date('2026-09-30T09:00:00.000Z'));
  });

  it('운영 관리자는 재오픈된 SR 의 마감일을 사유와 함께 조정하고, 활동에 조정 사실과 내부 사유를 남긴다', async () => {
    mockPrisma.sR.findUnique.mockResolvedValue({ ...reopened });

    await srService.updateSR(
      'sr-1',
      { dueDate: '2026-09-30T09:00:00.000Z', changeReason: '고객 요구 범위 확대' },
      manager
    );

    expect(updateData().dueDate).toEqual(new Date('2026-09-30T09:00:00.000Z'));
    const activity = tx.sRActivity.create.mock.calls[0]![0].data;
    expect(activity).toMatchObject({ srId: 'sr-1', userId: 'mgr-1', type: 'INTAKE_UPDATED' });
    expect(activity.description).toMatch(/^SLA 마감일 조정: .+ → .+$/);
    expect(activity.metadata).toMatchObject({
      dueDateAfter: '2026-09-30T09:00:00.000Z',
      internalReason: '고객 요구 범위 확대',
    });
  });

  it('한 번 완료된 SR 은 거절로 끝낼 수 없다(재오픈 → 보류 → 거절로 준수율에서 빠지는 경로)', async () => {
    mockPrisma.sR.findUnique.mockResolvedValue({ ...reopened, status: 'ON_HOLD' });

    await expect(
      srService.updateSR('sr-1', { status: 'REJECTED', rejectionReason: '범위 밖' }, manager)
    ).rejects.toThrow('한 번 완료된 SR은 거절로 끝낼 수 없습니다.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
