import { EventEmitter } from 'events';

import { transactionLocalStorage } from './transaction-context';

/**
 * 실시간 이벤트를 처리하기 위한 싱글톤 이벤트 이미터
 */
class RealtimeEventEmitter extends EventEmitter {
  constructor() {
    super();
    // 최대 리스너 수 증가 (많은 동시 접속 대응)
    this.setMaxListeners(100);
  }
}

declare const globalThis: {
  realtimeEmitterGlobal?: RealtimeEventEmitter;
} & typeof global;

/**
 * 프로세스 전역 싱글톤이다. 모듈 변수로 두면 서버 액션이 발행한 이벤트가
 * 라우트 그래프의 SSE 리스너에 닿지 않는다(domain-events.ts 와 같은 이유).
 */
export const realtimeEmitter = (globalThis.realtimeEmitterGlobal ??= new RealtimeEventEmitter());

/**
 * 이벤트 타입 정의
 */
export const REALTIME_EVENTS = {
  SR_UPDATED: 'sr:updated',
  SR_CREATED: 'sr:created',
  SR_DELETED: 'sr:deleted',
  SR_COMMENTED: 'sr:commented',
  NOTIFICATION_RECEIVED: 'notification:received',
} as const;

/**
 * 전역에 이벤트 발행 헬퍼
 */
export function emitRealtimeEvent(event: string, data: any) {
  const context = transactionLocalStorage.getStore();
  if (context) {
    context.realtimeEvents.push({ event, data });
    return;
  }
  realtimeEmitter.emit(event, data);
}
