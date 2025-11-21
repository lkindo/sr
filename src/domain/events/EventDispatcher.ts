/**
 * Domain Event Dispatcher
 *
 * 도메인 이벤트를 발행하고 핸들러를 등록하는 중앙 디스패처입니다.
 */

import { DomainEvent } from './DomainEvent';

type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => void | Promise<void>;

export class EventDispatcher {
  private static instance: EventDispatcher;
  private handlers: Map<string, EventHandler[]> = new Map();

  private constructor() {}

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): EventDispatcher {
    if (!EventDispatcher.instance) {
      EventDispatcher.instance = new EventDispatcher();
    }
    return EventDispatcher.instance;
  }

  /**
   * 이벤트 핸들러 등록
   *
   * @param eventName - 이벤트 이름 (예: "SR.Created")
   * @param handler - 이벤트 핸들러 함수
   *
   * @example
   * ```typescript
   * EventDispatcher.getInstance().register('SR.Created', async (event) => {
   *   await sendEmailNotification(event.payload);
   * });
   * ```
   */
  register<T extends DomainEvent>(eventName: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }

    this.handlers.get(eventName)!.push(handler as EventHandler);
  }

  /**
   * 이벤트 발행
   *
   * 등록된 모든 핸들러를 비동기로 실행합니다.
   *
   * @param event - 발행할 도메인 이벤트
   *
   * @example
   * ```typescript
   * const event = new SRCreatedEvent({ ... }, userId);
   * await EventDispatcher.getInstance().dispatch(event);
   * ```
   */
  async dispatch(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventName) || [];

    console.log(`[EventDispatcher] Dispatching event: ${event.eventName}`, {
      eventId: event.metadata.eventId,
      aggregateId: event.metadata.aggregateId,
      handlersCount: handlers.length,
    });

    // 모든 핸들러를 병렬로 실행
    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          console.error(
            `[EventDispatcher] Handler failed for event ${event.eventName}:`,
            error
          );
          // 핸들러 에러는 로깅만 하고 다른 핸들러 실행은 계속
        }
      })
    );
  }

  /**
   * 특정 이벤트의 핸들러 제거
   */
  unregister(eventName: string): void {
    this.handlers.delete(eventName);
  }

  /**
   * 모든 핸들러 제거 (테스트용)
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * 등록된 핸들러 수 반환 (디버깅용)
   */
  getHandlerCount(eventName: string): number {
    return this.handlers.get(eventName)?.length || 0;
  }
}

/**
 * 전역 이벤트 디스패처 인스턴스
 */
export const eventDispatcher = EventDispatcher.getInstance();
