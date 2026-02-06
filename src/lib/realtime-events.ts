import { EventEmitter } from 'events';

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

export const realtimeEmitter = new RealtimeEventEmitter();

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
  realtimeEmitter.emit(event, data);
}
