/**
 * prisma↔events import cycle 차단용, 병합 금지
 */
import { AsyncLocalStorage } from 'async_hooks';

interface TransactionEventContext {
  domainEvents: Array<{ eventName: string; args: any[] }>;
  realtimeEvents: Array<{ event: string; data: any }>;
}

declare const globalThis: {
  transactionLocalStorageGlobal?: AsyncLocalStorage<TransactionEventContext>;
} & typeof global;

/**
 * 프로세스 전역 싱글톤이다. 운영 빌드는 라우트·서버 액션·계측을 서로 다른 모듈 그래프로
 * 묶어서 모듈 변수가 그래프마다 따로 생긴다. 이벤트 버스만 공유하고 이 저장소가 갈라지면
 * 트랜잭션 안의 emit 이 컨텍스트를 찾지 못해, 커밋 전에(롤백될 작업의 알림까지) 나간다.
 */
export const transactionLocalStorage = (globalThis.transactionLocalStorageGlobal ??=
  new AsyncLocalStorage<TransactionEventContext>());
