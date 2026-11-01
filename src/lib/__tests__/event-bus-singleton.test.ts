import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SRCreatedEvent } from '../domain-events';

/**
 * 운영 빌드는 라우트·서버 액션·계측을 서로 다른 모듈 그래프로 묶는다. `vi.resetModules()` 뒤의
 * 재import 는 "다른 그래프가 같은 파일을 다시 평가한 상황"과 같다.
 */
async function importFromAnotherGraph<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return load();
}

const payload: SRCreatedEvent = {
  srId: 'sr-1',
  srNumber: 'SR-0001',
  title: 'Test SR',
  requesterId: 'user-1',
  requesterName: 'User 1',
};

const emptyContext = () => ({ domainEvents: [], realtimeEvents: [] });

describe('이벤트 버스의 프로세스 전역 공유', () => {
  afterEach(async () => {
    (await import('../domain-events')).domainEvents.removeAllListeners();
    (await import('../realtime-events')).realtimeEmitter.removeAllListeners();
  });

  it('다른 그래프가 발행한 도메인 이벤트가 이쪽 리스너에 닿는다', async () => {
    const listenerGraph = await import('../domain-events');
    const emitterGraph = await importFromAnotherGraph(() => import('../domain-events'));
    const listener = vi.fn();

    listenerGraph.domainEvents.on('sr:created', listener);
    emitterGraph.domainEvents.emit('sr:created', payload);

    expect(listener).toHaveBeenCalledWith(payload);
  });

  it('다른 그래프가 발행한 실시간 이벤트가 이쪽 리스너에 닿는다', async () => {
    const sseGraph = await import('../realtime-events');
    const actionGraph = await importFromAnotherGraph(() => import('../realtime-events'));
    const listener = vi.fn();

    sseGraph.realtimeEmitter.on(sseGraph.REALTIME_EVENTS.SR_DELETED, listener);
    actionGraph.emitRealtimeEvent(actionGraph.REALTIME_EVENTS.SR_DELETED, { id: 'sr-1' });

    expect(listener).toHaveBeenCalledWith({ id: 'sr-1' });
  });

  it('다른 그래프의 트랜잭션 안에서 발행한 도메인 이벤트는 커밋까지 미룬다', async () => {
    const bus = await import('../domain-events');
    const { transactionLocalStorage } = await importFromAnotherGraph(
      () => import('../transaction-context')
    );
    const listener = vi.fn();
    const context = emptyContext();

    bus.domainEvents.on('sr:created', listener);
    transactionLocalStorage.run(context, () => bus.domainEvents.emit('sr:created', payload));

    expect(listener).not.toHaveBeenCalled();
    expect(context.domainEvents).toEqual([{ eventName: 'sr:created', args: [payload] }]);
  });

  it('다른 그래프의 트랜잭션 안에서 발행한 실시간 이벤트는 커밋까지 미룬다', async () => {
    const bus = await import('../realtime-events');
    const { transactionLocalStorage } = await importFromAnotherGraph(
      () => import('../transaction-context')
    );
    const listener = vi.fn();
    const context = emptyContext();

    bus.realtimeEmitter.on('sr:updated', listener);
    transactionLocalStorage.run(context, () => bus.emitRealtimeEvent('sr:updated', { id: 'sr-1' }));

    expect(listener).not.toHaveBeenCalled();
    expect(context.realtimeEvents).toEqual([{ event: 'sr:updated', data: { id: 'sr-1' } }]);
  });
});
