/**
 * SR Assigned Event
 *
 * SR이 담당자에게 할당되었을 때 발생하는 도메인 이벤트입니다.
 */

import { DomainEvent } from '../DomainEvent';

export interface SRAssignedPayload {
  srId: string;
  srNumber: string;
  assignedTo: string;
  assignedBy: string;
  previousAssignee?: string;
}

export class SRAssignedEvent extends DomainEvent<SRAssignedPayload> {
  constructor(payload: SRAssignedPayload, userId: string) {
    super(payload.srId, 'SR', payload, userId);
  }

  get eventName(): string {
    return 'SR.Assigned';
  }

  /**
   * 재할당인지 확인
   */
  isReassignment(): boolean {
    return !!this.payload.previousAssignee;
  }

  /**
   * 알림 대상자 목록 반환
   */
  getNotificationTargets(): string[] {
    const targets = [this.payload.assignedTo];

    // 이전 담당자에게도 알림
    if (this.payload.previousAssignee) {
      targets.push(this.payload.previousAssignee);
    }

    return targets;
  }
}
