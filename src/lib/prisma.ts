import { PrismaClient } from '@prisma/client'

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
  })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>
} & typeof global

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

// Fallback for build time - create a mock object
const safePrisma = prisma ?? {} as PrismaClient;

export default safePrisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

// Slow query logger (development only)
if (process.env.NODE_ENV === 'development' && prisma) {
  const slowMs = Number(process.env.PRISMA_SLOW_MS ?? 200)
  const slowLogFile = process.env.PRISMA_SLOW_LOG_FILE
  let append: ((line: string) => void) | null = null
  if (slowLogFile) {
    const { appendFileSync, mkdirSync } = require('fs')
    const { dirname } = require('path')
    try {
      mkdirSync(dirname(slowLogFile), { recursive: true })
      append = (line: string) => appendFileSync(slowLogFile, line + '\n', { encoding: 'utf8' })
    } catch {
      append = null
    }
  }
  // Use middleware only if supported by current Prisma version
  type PrismaMiddlewareParams = {
    model?: string;
    action: string;
    args: unknown;
    dataPath: string[];
    runInTransaction: boolean;
  };
  type PrismaMiddlewareNext = (params: PrismaMiddlewareParams) => Promise<unknown>;

  const applyMw = (prisma as unknown as { $use?: (fn: (params: PrismaMiddlewareParams, next: PrismaMiddlewareNext) => Promise<unknown>) => void }).$use;

  if (typeof applyMw === 'function') {
    applyMw(async (params: PrismaMiddlewareParams, next: PrismaMiddlewareNext) => {
      const startedAt = Date.now()
      const result = await next(params)
      const duration = Date.now() - startedAt
      if (duration >= slowMs) {
        const line = `[Prisma][SlowQuery] ${(params.model ?? 'raw')}.${params.action} ${duration}ms`
        // eslint-disable-next-line no-console
        console.warn(line)
        if (append) append(line)
      }
      return result
    })
  }
}