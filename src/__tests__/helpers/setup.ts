import { vi } from 'vitest'

// Mock NextAuth
vi.mock('@/auth', () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
      },
    })
  ),
}))

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    sR: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    sRActivity: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    sRStatusHistory: {
      create: vi.fn(),
    },
    sRComment: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    client: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// Mock Email service
vi.mock('@/lib/email', () => ({
  sendSRCreatedNotification: vi.fn(() => Promise.resolve()),
  sendSRAssignedNotification: vi.fn(() => Promise.resolve()),
  sendSRStatusChangedNotification: vi.fn(() => Promise.resolve()),
  sendSRCommentNotification: vi.fn(() => Promise.resolve()),
}))


