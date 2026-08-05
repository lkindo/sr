/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `/api/srs/[id]/comments` 계약 테스트.
 *
 * 이 라우트는 244줄로 API 라우트 중 가장 크면서 테스트가 하나도 없었다.
 * 여기서 고정하는 것:
 *   1. 내부 노트(`isInternal`) 가 외부 사용자에게 새지 않는다.
 *   2. 댓글 + 활동로그가 한 트랜잭션에 묶인다.
 *   3. 푸시 알림이 작성자 본인을 제외하고, 설정을 존중하는 경로로 나간다(감사 4.3).
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  commentCreate: vi.fn(),
  activityCreate: vi.fn(),
  enqueueEmails: vi.fn().mockResolvedValue(0),
  sendForEvent: vi.fn().mockResolvedValue(undefined),
  emitRealtimeEvent: vi.fn(),
  backgroundTask: vi.fn((p: Promise<unknown>) => p),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: { findUnique: mocks.findUnique },
    sRComment: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));

// 인가는 실물을 쓴다. 여기서 정책을 가짜로 덮으면 이 라우트가 인가를 통째로
// 잃어도 테스트가 통과한다.
vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => handler,
}));

vi.mock('@/lib/wait-until', () => ({ backgroundTask: mocks.backgroundTask }));

vi.mock('@/lib/realtime-events', () => ({
  emitRealtimeEvent: mocks.emitRealtimeEvent,
  REALTIME_EVENTS: { SR_COMMENTED: 'sr:commented' },
}));

vi.mock('@/services/notification-outbox', () => ({ enqueueEmails: mocks.enqueueEmails }));

vi.mock('@/services/push.service', () => ({
  pushService: { sendForEvent: mocks.sendForEvent },
}));

vi.mock('@/services/email.service', () => ({
  emailService: { buildCommentAdded: vi.fn(() => ({ to: 'x', subject: 's', html: 'h' })) },
}));

import { PERMISSIONS } from '@/lib/permission-helpers';

import { GET, POST } from '../route';

const SR = {
  id: 'sr-1',
  clientId: 'client-A',
  requesterId: 'user-requester',
  assigneeId: 'user-engineer',
  srNumber: 'SR-001',
  title: '테스트 SR',
  requester: { id: 'user-requester', email: 'req@corp.com', notificationPreference: null },
  assignee: { id: 'user-engineer', email: 'eng@corp.com', notificationPreference: null },
};

const externalUser = {
  id: 'user-requester',
  roles: ['CLIENT_USER'],
  permissions: [PERMISSIONS.SR.READ],
  clientIds: ['client-A'],
};

const internalUser = {
  id: 'user-admin',
  roles: ['ADMIN'],
  permissions: [],
  clientIds: [],
};

const ctx = (user: unknown) => ({
  session: { user },
  params: Promise.resolve({ id: 'sr-1' }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue(SR);
  mocks.findMany.mockResolvedValue([]);
  mocks.commentCreate.mockResolvedValue({
    id: 'c-1',
    content: '내용',
    user: { id: 'user-admin', name: '관리자', email: 'a@corp.com' },
  });
  mocks.transaction.mockImplementation(async (cb: any) =>
    cb({ sRComment: { create: mocks.commentCreate }, sRActivity: { create: mocks.activityCreate } })
  );
});

describe('GET — 내부 노트 격리', () => {
  it('외부 사용자에게는 isInternal: false 만 조회한다', async () => {
    await (GET as any)(new NextRequest('http://localhost/x'), ctx(externalUser));

    const where = mocks.findMany.mock.calls[0]![0].where;
    // 이 필터가 없으면, 누군가 isInternal 을 세우는 순간 내부 노트가 고객에게 나간다.
    expect(where.isInternal).toBe(false);
    expect(where.srId).toBe('sr-1');
  });

  it('내부 사용자에게는 필터를 걸지 않는다', async () => {
    await (GET as any)(new NextRequest('http://localhost/x'), ctx(internalUser));

    const where = mocks.findMany.mock.calls[0]![0].where;
    expect(where.isInternal).toBeUndefined();
  });

  it('SR 이 없으면 조회하지 않는다', async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(
      (GET as any)(new NextRequest('http://localhost/x'), ctx(internalUser))
    ).rejects.toThrow();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('권한 없는 사용자는 거부하고 댓글을 읽지 않는다', async () => {
    const outsider = { id: 'u', roles: ['CLIENT_USER'], permissions: [], clientIds: ['other'] };

    await expect(
      (GET as any)(new NextRequest('http://localhost/x'), ctx(outsider))
    ).rejects.toThrow(/권한/);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});

const postRequest = (content: string) =>
  new NextRequest('http://localhost/x', {
    method: 'POST',
    body: JSON.stringify({ content }),
    headers: { 'content-type': 'application/json' },
  });

describe('POST — 원자성', () => {
  it('댓글과 활동로그를 한 트랜잭션에서 만든다', async () => {
    await (POST as any)(postRequest('충분히 긴 댓글 내용'), ctx(internalUser));

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.commentCreate).toHaveBeenCalledTimes(1);
    expect(mocks.activityCreate).toHaveBeenCalledTimes(1);
  });

  it('빈 본문은 400 계열로 거부한다', async () => {
    const req = new NextRequest('http://localhost/x', {
      method: 'POST',
      body: '',
      headers: { 'content-type': 'application/json' },
    });

    await expect((POST as any)(req, ctx(internalUser))).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('상한을 넘는 본문은 거부한다', async () => {
    await expect(
      (POST as any)(postRequest('가'.repeat(100_000)), ctx(internalUser))
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('POST — 알림', () => {
  it('설정을 존중하는 sendForEvent 로 푸시를 보낸다', async () => {
    await (POST as any)(postRequest('충분히 긴 댓글 내용'), ctx(internalUser));

    // 이 경로는 예전에 pushService 를 아예 호출하지 않아 `pushCommentAdded` 설정이
    // 통째로 죽어 있었다(감사 4.3).
    expect(mocks.sendForEvent).toHaveBeenCalledWith(
      'COMMENT_ADDED',
      expect.arrayContaining(['user-requester', 'user-engineer']),
      expect.objectContaining({ tag: 'comment-added' })
    );
  });

  it('작성자 본인은 푸시 대상에서 제외한다', async () => {
    // 요청자가 자기 SR 에 댓글을 다는 경우.
    await (POST as any)(postRequest('충분히 긴 댓글 내용'), ctx(externalUser));

    const targets = mocks.sendForEvent.mock.calls[0]![1] as string[];
    expect(targets).not.toContain('user-requester');
    expect(targets).toContain('user-engineer');
  });

  it('요청자와 담당자가 같으면 중복 발송하지 않는다', async () => {
    mocks.findUnique.mockResolvedValue({
      ...SR,
      assigneeId: 'user-requester',
      assignee: SR.requester,
    });

    await (POST as any)(postRequest('충분히 긴 댓글 내용'), ctx(internalUser));

    const targets = mocks.sendForEvent.mock.calls[0]![1] as string[];
    expect(targets).toEqual(['user-requester']);
  });

  it('담당자가 없어도 요청자에게는 보낸다', async () => {
    mocks.findUnique.mockResolvedValue({ ...SR, assigneeId: null, assignee: null });

    await (POST as any)(postRequest('충분히 긴 댓글 내용'), ctx(internalUser));

    const targets = mocks.sendForEvent.mock.calls[0]![1] as string[];
    expect(targets).toEqual(['user-requester']);
  });

  it('실시간 이벤트에 테넌트 격리 키를 싣는다', async () => {
    await (POST as any)(postRequest('충분히 긴 댓글 내용'), ctx(internalUser));

    expect(mocks.emitRealtimeEvent).toHaveBeenCalledWith(
      'sr:commented',
      expect.objectContaining({
        // 이 키들이 없으면 SSE 가 전 사용자에게 브로드캐스트된다.
        clientId: 'client-A',
        requesterId: 'user-requester',
        actorId: 'user-admin',
      })
    );
  });
});
