import 'server-only';

import { PrismaClient } from '@prisma/client';

import { transactionLocalStorage } from './transaction-context';

const prismaClientSingleton = () => {
  // 빌드 타임에는 DATABASE_URL이 없을 수 있으므로 체크
  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.warn('DATABASE_URL is not set, Prisma client will not be initialized');
    return null;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // 연결 풀 최적화 옵션
    datasources: {
      db: {
        url: process.env.DATABASE_URL!,
      },
    },
  });
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

/**
 * 슬로우 쿼리 감지를 붙인다 (db-rules §4).
 *
 * 예전 구현은 `$use`(Prisma Middleware) 존재 여부로 분기했는데, **Prisma 6 에서 `$use` 는
 * 제거되어 그 분기가 한 번도 참이 되지 않았다** — 등록조차 되지 않는 죽은 코드였다.
 * 게다가 `NODE_ENV === 'development'` 로 한정돼 있어, 설령 동작했더라도 정작 느린 쿼리가
 * 문제되는 프로덕션에서는 아무 경고도 남지 않았다. 개발 환경에서는 `log: ['query']` 가
 * 전체 쿼리를 찍으므로 오히려 느린 쿼리가 잡음에 묻힌다.
 *
 * Client Extension 으로 교체하고 환경 가드를 없앤다. 확장은 원본 인스턴스를 변형하지 않고
 * **새 인스턴스를 돌려주므로 반드시 그 결과를 export 해야 한다.**
 */
function withSlowQueryLogging<T extends PrismaClient>(client: T): T {
  const slowMs = Number(process.env.PRISMA_SLOW_MS ?? 200);

  return client.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const startedAt = Date.now();
        try {
          return await query(args);
        } finally {
          const duration = Date.now() - startedAt;
          if (duration >= slowMs) {
            // logger 를 정적 import 하면 prisma ← logger ← prisma 순환이 생긴다.
            void import('./logger').then(({ logger }) => {
              logger.warn(`[Prisma][SlowQuery] ${model ?? 'raw'}.${operation} ${duration}ms`, {
                model: model ?? 'raw',
                operation,
                durationMs: duration,
                thresholdMs: slowMs,
              });
            });
          }
        }
      },
    },
  }) as unknown as T;
}

const basePrisma = globalThis.prismaGlobal ?? prismaClientSingleton();
const prisma = basePrisma ? withSlowQueryLogging(basePrisma) : basePrisma;

if (prisma) {
  const originalTransaction = prisma.$transaction.bind(prisma);

  prisma.$transaction = async function (arg1: any, arg2: any) {
    const context = {
      domainEvents: [] as any[],
      realtimeEvents: [] as any[],
    };

    const result = await transactionLocalStorage.run(context, async () => {
      return await originalTransaction(arg1, arg2);
    });

    if (context.domainEvents.length > 0) {
      const { domainEvents } = await import('./domain-events');
      context.domainEvents.forEach(({ eventName, args }) => {
        domainEvents.emit(eventName, ...args);
      });
    }

    if (context.realtimeEvents.length > 0) {
      const { emitRealtimeEvent } = await import('./realtime-events');
      context.realtimeEvents.forEach(({ event, data }) => {
        emitRealtimeEvent(event, data);
      });
    }

    return result;
  } as any;
}

// Fallback for build time - create a mock object
const safePrisma = prisma ?? ({} as PrismaClient);

export default safePrisma;

// 확장 **이전** 인스턴스를 캐시한다. 확장된 것을 넣으면 HMR 마다 확장이 중첩된다.
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = basePrisma;
