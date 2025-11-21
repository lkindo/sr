/**
 * Domain Event Base Class
 *
 * 모든 도메인 이벤트의 기본 클래스입니다.
 */

export interface DomainEventMetadata {
  eventId: string;
  occurredAt: Date;
  userId?: string;
  aggregateId: string;
  aggregateType: string;
}

export abstract class DomainEvent<T = any> {
  public readonly metadata: DomainEventMetadata;
  public readonly payload: T;

  constructor(
    aggregateId: string,
    aggregateType: string,
    payload: T,
    userId?: string
  ) {
    this.metadata = {
      eventId: this.generateEventId(),
      occurredAt: new Date(),
      userId,
      aggregateId,
      aggregateType,
    };
    this.payload = payload;
  }

  /**
   * 이벤트 이름 (하위 클래스에서 구현)
   */
  abstract get eventName(): string;

  /**
   * 이벤트 ID 생성
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 이벤트를 JSON으로 직렬화
   */
  toJSON(): {
    eventName: string;
    metadata: DomainEventMetadata;
    payload: T;
  } {
    return {
      eventName: this.eventName,
      metadata: this.metadata,
      payload: this.payload,
    };
  }
}
