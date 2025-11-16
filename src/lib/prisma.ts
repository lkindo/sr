import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
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

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

// Slow query logger (development only)
if (process.env.NODE_ENV === 'development') {
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
  const applyMw = (prisma as unknown as { $use?: (fn: (params: any, next: any) => Promise<any>) => void }).$use
  if (typeof applyMw === 'function') {
    applyMw(async (params: any, next: any) => {
      const startedAt = Date.now()
      const result = await next(params)
      const duration = Date.now() - startedAt
      if (duration >= slowMs) {
        const line = `[Prisma][SlowQuery] ${(params.model ?? 'raw')}.${params.action} ${duration}ms`
        console.warn(line)
        if (append) append(line)
      }
      return result
    })
  }
}