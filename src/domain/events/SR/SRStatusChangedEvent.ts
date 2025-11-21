/**
 * SR Status Changed Event
 *
 * SR 상태가 변경되었을 때 발생하는 도메인 이벤트입니다.
 */

import { DomainEvent } from '../DomainEvent';

export interface SRStatusChangedPayload {
  srId: string;
  srNumber: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  reason?: string;
}

export class SRStatusChangedEvent extends DomainEvent<SRStatusChangedPayload> {
  constructor(payload: SRStatusChangedPayload, userId: string) {
    super(payload.srId, 'SR', payload, userId);
  }

  get eventName(): string {
    return 'SR.StatusChanged';
  }

  /**
   * 완료로 전환되었는지 확인
   */
  isCompletedTransition(): boolean {
    return (
      this.payload.previousStatus !== 'RESOLVED' &&
      this.payload.newStatus === 'RESOLVED'
    );
  }

  /**
   * 긴급 상태로 전환되었는지 확인
   */
  isEscalated(): boolean {
    const escalationTransitions = [
      ['OPEN', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'PENDING'],
      ['PENDING', 'IN_PROGRESS'],
    ];

    return escalationTransitions.some(
      ([from, to]) =>
        this.payload.previousStatus === from && this.payload.newStatus === to
    );
  }

  /**
   * 알림 발송이 필요한지 확인
   */
  shouldNotifyRequester(): boolean {
    // 요청자에게 알림이 필요한 상태 전환
    const notifyStatuses = ['IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    return notifyStatuses.includes(this.payload.newStatus);
  }
}
