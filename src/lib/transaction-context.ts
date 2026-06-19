import { AsyncLocalStorage } from 'async_hooks';

export interface TransactionEventContext {
  domainEvents: Array<{ eventName: string; args: any[] }>;
  realtimeEvents: Array<{ event: string; data: any }>;
}

export const transactionLocalStorage = new AsyncLocalStorage<TransactionEventContext>();
