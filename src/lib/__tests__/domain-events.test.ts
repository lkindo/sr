import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SRAssignedEvent, SRCreatedEvent, SRStatusChangedEvent } from '../domain-events';
import { domainEvents } from '../domain-events';
import { transactionLocalStorage } from '../transaction-context';

const createdPayload: SRCreatedEvent = {
  srId: 'sr-1',
  srNumber: 'SR-0001',
  title: 'Test SR',
  requesterId: 'user-1',
  requesterName: 'User 1',
};

const statusPayload: SRStatusChangedEvent = {
  srId: 'sr-2',
  srNumber: 'SR-0002',
  title: 'Status SR',
  requesterId: 'user-2',
  previousStatus: null,
  currentStatus: 'IN_PROGRESS' as SRStatusChangedEvent['currentStatus'],
};

const assignedPayload: SRAssignedEvent = {
  srId: 'sr-3',
  srNumber: 'SR-0003',
  title: 'Assigned SR',
  assigneeId: 'assignee-1',
  assigneeName: 'Assignee 1',
};

describe('domainEvents (DomainEventEmitter singleton)', () => {
  beforeEach(() => {
    domainEvents.removeAllListeners();
  });

  afterEach(() => {
    domainEvents.removeAllListeners();
  });

  it('싱글톤이며 maxListeners가 50으로 설정되어 있어야 함', () => {
    expect(domainEvents).toBeDefined();
    expect(domainEvents.getMaxListeners()).toBe(50);
  });

  it('on/emit: 등록된 리스너가 페이로드와 함께 호출되어야 함', () => {
    const listener = vi.fn();
    const returned = domainEvents.on('sr:created', listener);

    // on은 this를 반환해야 함 (체이닝 지원)
    expect(returned).toBe(domainEvents);

    const result = domainEvents.emit('sr:created', createdPayload);

    expect(result).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(createdPayload);
  });

  it('emit: 리스너가 없으면 false를 반환해야 함', () => {
    const result = domainEvents.emit('sr:assigned', assignedPayload);
    expect(result).toBe(false);
  });

  it('off: 리스너를 제거하면 더 이상 호출되지 않아야 함', () => {
    const listener = vi.fn();
    domainEvents.on('sr:status_changed', listener);

    domainEvents.emit('sr:status_changed', statusPayload);
    expect(listener).toHaveBeenCalledTimes(1);

    const returned = domainEvents.off('sr:status_changed', listener);
    expect(returned).toBe(domainEvents);

    domainEvents.emit('sr:status_changed', statusPayload);
    // off 이후에는 호출 횟수가 늘지 않아야 함
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('once: 리스너가 단 한 번만 호출되어야 함', () => {
    const listener = vi.fn();
    domainEvents.once('sr:created', listener);

    domainEvents.emit('sr:created', createdPayload);
    domainEvents.emit('sr:created', createdPayload);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('removeAllListeners: 모든 리스너가 제거되어야 함', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    domainEvents.on('sr:created', listenerA);
    domainEvents.on('sr:assigned', listenerB);

    domainEvents.removeAllListeners();

    expect(domainEvents.emit('sr:created', createdPayload)).toBe(false);
    expect(domainEvents.emit('sr:assigned', assignedPayload)).toBe(false);
    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).not.toHaveBeenCalled();
  });

  it('여러 리스너가 동일 이벤트에 등록되면 모두 호출되어야 함', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    domainEvents.on('sr:created', l1);
    domainEvents.on('sr:created', l2);

    domainEvents.emit('sr:created', createdPayload);

    expect(l1).toHaveBeenCalledWith(createdPayload);
    expect(l2).toHaveBeenCalledWith(createdPayload);
  });
});

describe('domainEvents.emit (트랜잭션 컨텍스트 분기)', () => {
  beforeEach(() => {
    domainEvents.removeAllListeners();
  });

  afterEach(() => {
    domainEvents.removeAllListeners();
  });

  it('트랜잭션 컨텍스트 내부에서 emit하면 즉시 발송되지 않고 큐에 적재되어야 함', () => {
    const listener = vi.fn();
    domainEvents.on('sr:created', listener);

    const context = {
      domainEvents: [] as Array<{ eventName: string; args: any[] }>,
      realtimeEvents: [] as Array<{ event: string; data: any }>,
    };

    const result = transactionLocalStorage.run(context, () =>
      domainEvents.emit('sr:created', createdPayload)
    );

    // 큐에 적재되었으므로 리스너는 호출되지 않고 true를 반환
    expect(result).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(context.domainEvents).toHaveLength(1);
    expect(context.domainEvents[0]).toEqual({
      eventName: 'sr:created',
      args: [createdPayload],
    });
  });

  it('트랜잭션 컨텍스트 외부에서 emit하면 즉시 발송되어야 함', () => {
    const listener = vi.fn();
    domainEvents.on('sr:status_changed', listener);

    const result = domainEvents.emit('sr:status_changed', statusPayload);

    expect(result).toBe(true);
    expect(listener).toHaveBeenCalledWith(statusPayload);
  });
});
