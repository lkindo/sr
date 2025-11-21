/**
 * SR Created Event
 *
 * SR이 생성되었을 때 발생하는 도메인 이벤트입니다.
 */

import { DomainEvent } from '../DomainEvent';

export interface SRCreatedPayload {
  srId: string;
  srNumber: string;
  title: string;
  clientId: string;
  requesterId: string;
  priority: string;
  status: string;
}

export class SRCreatedEvent extends DomainEvent<SRCreatedPayload> {
  constructor(payload: SRCreatedPayload, userId: string) {
    super(payload.srId, 'SR', payload, userId);
  }

  get eventName(): string {
    return 'SR.Created';
  }

  /**
   * 알림 발송이 필요한지 확인
   */
  shouldNotify(): boolean {
    // URGENT 또는 HIGH 우선순위인 경우 알림 필요
    return ['URGENT', 'HIGH'].includes(this.payload.priority);
  }
}
