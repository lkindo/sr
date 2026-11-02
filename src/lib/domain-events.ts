import type { SRStatus } from '@prisma/client';
import { EventEmitter } from 'events';

import { transactionLocalStorage } from './transaction-context';

/**
 * 도메인 이벤트 페이로드 정의
 */
export interface SRCreatedEvent {
  srId: string;
  srNumber: string;
  title: string;
  requesterId: string;
  requesterName: string;
}

export interface SRStatusChangedEvent {
  srId: string;
  srNumber: string;
  title: string;
  requesterId?: string;
  previousStatus: SRStatus | null;
  currentStatus: SRStatus;
  /** 전이를 일으킨 사용자. 본인 행동에 대한 알림은 보내지 않는다(2026-09-18 소유자 결정 D15). */
  actorId?: string;
  /** 담당자 — 재오픈 알림의 수신자다(D15). */
  assigneeId?: string | null;
  /** 전이 사유(재오픈 사유 등). 재오픈 알림 본문에 싣는다. */
  reason?: string | null;
}

export interface SRAssignedEvent {
  srId: string;
  srNumber: string;
  title: string;
  assigneeId: string | null;
  assigneeName: string | null;
}

// 이벤트 맵 타입
interface DomainEventsMap {
  'sr:created': (payload: SRCreatedEvent) => void;
  'sr:status_changed': (payload: SRStatusChangedEvent) => void;
  'sr:assigned': (payload: SRAssignedEvent) => void;
}

/**
 * 타입 안전성이 보장되는 도메인 이벤트 이미터
 */
class DomainEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // 타입 추론을 위한 오버로딩
  emit<K extends keyof DomainEventsMap>(
    eventName: K,
    ...args: Parameters<DomainEventsMap[K]>
  ): boolean {
    const context = transactionLocalStorage.getStore();
    if (context) {
      context.domainEvents.push({ eventName, args });
      return true;
    }
    return super.emit(eventName, ...args);
  }

  on<K extends keyof DomainEventsMap>(eventName: K, listener: DomainEventsMap[K]): this {
    return super.on(eventName, listener);
  }

  off<K extends keyof DomainEventsMap>(eventName: K, listener: DomainEventsMap[K]): this {
    return super.off(eventName, listener);
  }
}

declare const globalThis: {
  domainEventsGlobal?: DomainEventEmitter;
} & typeof global;

/**
 * 프로세스 전역 싱글톤 도메인 이벤트 버스.
 *
 * 모듈 변수로 두면 운영 빌드에서 그래프마다 다른 인스턴스가 생긴다. 리스너는 계측 쪽
 * 인스턴스에 붙는데 라우트는 자기 인스턴스로 발행해서, 이벤트가 리스너 0개로 사라졌다.
 */
export const domainEvents = (globalThis.domainEventsGlobal ??= new DomainEventEmitter());
