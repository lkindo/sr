import { beforeEach, describe, expect, it, vi } from 'vitest';

import { domainEvents } from '../domain-events';
import { emitRealtimeEvent, realtimeEmitter } from '../realtime-events';
import { transactionLocalStorage } from '../transaction-context';

describe('Transaction-Aware Event Dispatching', () => {
  const mockDomainListener = vi.fn();
  const mockRealtimeListener = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    domainEvents.removeAllListeners('sr:created');
    realtimeEmitter.removeAllListeners('sr:updated');

    domainEvents.on('sr:created', mockDomainListener);
    realtimeEmitter.on('sr:updated', mockRealtimeListener);
  });

  it('트랜잭션 외부에서 이벤트를 호출하면 즉시 발송되어야 함', () => {
    domainEvents.emit('sr:created', {
      srId: 'sr-1',
      srNumber: 'SR-0001',
      title: 'Test SR',
      requesterId: 'user-1',
      requesterName: 'User 1',
    });

    emitRealtimeEvent('sr:updated', { id: 'sr-1' });

    expect(mockDomainListener).toHaveBeenCalledTimes(1);
    expect(mockRealtimeListener).toHaveBeenCalledTimes(1);
  });

  it('트랜잭션 내부에서 이벤트를 호출하면 즉시 발송되지 않고 큐에 적재되어야 함', () => {
    const context = {
      domainEvents: [] as any[],
      realtimeEvents: [] as any[],
    };

    transactionLocalStorage.run(context, () => {
      domainEvents.emit('sr:created', {
        srId: 'sr-1',
        srNumber: 'SR-0001',
        title: 'Test SR',
        requesterId: 'user-1',
        requesterName: 'User 1',
      });

      emitRealtimeEvent('sr:updated', { id: 'sr-1' });

      // 큐에만 쌓이고 아직 리스너가 돌지 않아야 함
      expect(mockDomainListener).not.toHaveBeenCalled();
      expect(mockRealtimeListener).not.toHaveBeenCalled();
      expect(context.domainEvents).toHaveLength(1);
      expect(context.realtimeEvents).toHaveLength(1);
    });
  });

  it('트랜잭션 커밋 완료(성공) 시 큐에 적재된 이벤트가 한꺼번에 순차적으로 발송되어야 함', async () => {
    const context = {
      domainEvents: [] as any[],
      realtimeEvents: [] as any[],
    };

    // 가상의 트랜잭션 래퍼 실행 (성공 케이스)
    const runMockTransaction = async () => {
      return await transactionLocalStorage.run(context, async () => {
        domainEvents.emit('sr:created', {
          srId: 'sr-1',
          srNumber: 'SR-0001',
          title: 'Test SR',
          requesterId: 'user-1',
          requesterName: 'User 1',
        });

        emitRealtimeEvent('sr:updated', { id: 'sr-1' });
        return 'SUCCESS';
      });
    };

    const result = await runMockTransaction();

    expect(result).toBe('SUCCESS');
    expect(mockDomainListener).not.toHaveBeenCalled(); // 아직 커밋 후 전송 코드가 안 돌았음

    // 트랜잭션 성공 후 이벤트 순차 디스패치 (prisma.ts 래퍼 로직 시뮬레이션)
    context.domainEvents.forEach(({ eventName, args }) => {
      domainEvents.emit(eventName, ...args);
    });
    context.realtimeEvents.forEach(({ event, data }) => {
      emitRealtimeEvent(event, data);
    });

    expect(mockDomainListener).toHaveBeenCalledTimes(1);
    expect(mockRealtimeListener).toHaveBeenCalledTimes(1);
    expect(mockDomainListener).toHaveBeenCalledWith(
      expect.objectContaining({ srId: 'sr-1', srNumber: 'SR-0001' })
    );
  });

  it('트랜잭션 롤백(실패) 시 큐에 적재된 이벤트는 완전히 파기되고 전송되지 않아야 함', async () => {
    const context = {
      domainEvents: [] as any[],
      realtimeEvents: [] as any[],
    };

    const runMockTransaction = async () => {
      return await transactionLocalStorage.run(context, async () => {
        domainEvents.emit('sr:created', {
          srId: 'sr-1',
          srNumber: 'SR-0001',
          title: 'Test SR',
          requesterId: 'user-1',
          requesterName: 'User 1',
        });

        emitRealtimeEvent('sr:updated', { id: 'sr-1' });
        throw new Error('ROLLBACK_TRIGGER');
      });
    };

    await expect(runMockTransaction()).rejects.toThrow('ROLLBACK_TRIGGER');

    // 롤백 시 이벤트 방출 로직을 태우지 않으므로, 큐는 그대로 유지되거나 무시되고 리스너는 실행 안 됨
    expect(mockDomainListener).not.toHaveBeenCalled();
    expect(mockRealtimeListener).not.toHaveBeenCalled();
  });
});
