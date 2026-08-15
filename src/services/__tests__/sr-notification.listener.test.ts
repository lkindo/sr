import { beforeEach, describe, expect, it, vi } from 'vitest';

import { domainEvents } from '@/lib/domain-events';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { backgroundTask } from '@/lib/wait-until';
import { pushService } from '@/services/push.service';

vi.mock('@/lib/prisma', () => ({
  default: { user: { findMany: vi.fn() } },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/wait-until', () => ({ backgroundTask: vi.fn() }));

vi.mock('@/services/push.service', () => ({
  pushService: { sendForEvent: vi.fn().mockResolvedValue(undefined) },
}));

import { registerSRNotificationListeners } from '../listeners/sr-notification.listener';

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  vi.clearAllMocks();
  domainEvents.removeAllListeners();
  registerSRNotificationListeners();
});

describe('SR 알림 리스너', () => {
  it('세 가지 푸시 리스너를 한 번씩 등록한다', () => {
    expect(logger.info).toHaveBeenCalledWith('SR Notification Listeners registered');
    expect(domainEvents.listenerCount('sr:created')).toBe(1);
    expect(domainEvents.listenerCount('sr:status_changed')).toBe(1);
    expect(domainEvents.listenerCount('sr:assigned')).toBe(1);
  });

  it('SR 생성 시 활성 관리자·매니저에게 설정 존중 푸시를 예약한다', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'admin-1' },
      { id: 'manager-1' },
    ] as never);

    domainEvents.emit('sr:created', {
      srId: 'sr-1',
      srNumber: 'SR-001',
      title: '새 요청',
      requesterId: 'requester-1',
      requesterName: '요청자',
    });
    await flush();

    expect(pushService.sendForEvent).toHaveBeenCalledWith(
      'SR_CREATED',
      ['admin-1', 'manager-1'],
      expect.objectContaining({ tag: 'sr-created', url: '/srs/sr-1' })
    );
    expect(backgroundTask).toHaveBeenCalledTimes(1);
  });

  it('상태 변경은 요청자에게 푸시하고 이메일 적재는 이 리스너에서 중복 수행하지 않는다', async () => {
    domainEvents.emit('sr:status_changed', {
      srId: 'sr-2',
      srNumber: 'SR-002',
      title: '상태 변경',
      requesterId: 'requester-2',
      previousStatus: 'INTAKE',
      currentStatus: 'IN_PROGRESS',
    });
    await flush();

    expect(pushService.sendForEvent).toHaveBeenCalledWith(
      'SR_STATUS_CHANGED',
      ['requester-2'],
      expect.objectContaining({ tag: 'sr-status-changed' })
    );
  });

  it('요청자 없는 상태 변경은 건너뛴다', async () => {
    domainEvents.emit('sr:status_changed', {
      srId: 'sr-2',
      srNumber: 'SR-002',
      title: '상태 변경',
      previousStatus: 'INTAKE',
      currentStatus: 'IN_PROGRESS',
    });
    await flush();
    expect(pushService.sendForEvent).not.toHaveBeenCalled();
  });

  it('담당자 배정은 새 담당자에게 푸시한다', async () => {
    domainEvents.emit('sr:assigned', {
      srId: 'sr-3',
      srNumber: 'SR-003',
      title: '배정',
      assigneeId: 'engineer-1',
      assigneeName: '담당자',
    });
    await flush();

    expect(pushService.sendForEvent).toHaveBeenCalledWith(
      'SR_ASSIGNED',
      ['engineer-1'],
      expect.objectContaining({ tag: 'sr-assigned' })
    );
  });

  it('담당 해제는 푸시하지 않는다', async () => {
    domainEvents.emit('sr:assigned', {
      srId: 'sr-3',
      srNumber: 'SR-003',
      title: '배정 해제',
      assigneeId: null,
      assigneeName: null,
    });
    await flush();

    expect(pushService.sendForEvent).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('SR 담당 해제 감지 (알림 생략)', { srId: 'sr-3' });
  });

  it('관리자 조회 실패를 기록한다', async () => {
    vi.mocked(prisma.user.findMany).mockRejectedValue(new Error('db down'));
    domainEvents.emit('sr:created', {
      srId: 'sr-4',
      srNumber: 'SR-004',
      title: '실패',
      requesterId: 'requester-1',
      requesterName: '요청자',
    });
    await flush();

    expect(logger.error).toHaveBeenCalledWith(
      'Failed to handle sr:created notification',
      expect.any(Error),
      { srId: 'sr-4' }
    );
  });
});
