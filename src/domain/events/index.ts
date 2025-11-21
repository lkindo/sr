/**
 * Domain Events Index
 *
 * 모든 Domain Events를 export합니다.
 */

export { DomainEvent } from './DomainEvent';
export { EventDispatcher, eventDispatcher } from './EventDispatcher';

// SR Events
export { SRCreatedEvent } from './SR/SRCreatedEvent';
export { SRStatusChangedEvent } from './SR/SRStatusChangedEvent';
export { SRAssignedEvent } from './SR/SRAssignedEvent';

// Types
export type { DomainEventMetadata } from './DomainEvent';
export type { SRCreatedPayload } from './SR/SRCreatedEvent';
export type { SRStatusChangedPayload } from './SR/SRStatusChangedEvent';
export type { SRAssignedPayload } from './SR/SRAssignedEvent';
