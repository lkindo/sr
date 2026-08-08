/**
 * prisma↔events import cycle 차단용, 병합 금지
 */
import { AsyncLocalStorage } from 'async_hooks';

interface TransactionEventContext {
  domainEvents: Array<{ eventName: string; args: any[] }>;
  realtimeEvents: Array<{ event: string; data: any }>;
}

export const transactionLocalStorage = new AsyncLocalStorage<TransactionEventContext>();
