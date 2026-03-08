import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const { mockPrisma } = vi.hoisted(() => {
  const mock = {
    $transaction: vi.fn((cb) => cb(mock)),
    sR: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sRActivity: {
      create: vi.fn(),
    },
    sRStatusHistory: {
      create: vi.fn(),
    },
    client: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    sRSequence: {
      upsert: vi.fn(),
    },
  };
  return { mockPrisma: mock };
});

vi.mock('@/lib/prisma', () => ({
  default: mockPrisma,
}));

vi.mock('@/lib/policies', () => ({
  ensureCanCreateSR: vi.fn(),
}));

vi.mock('@/services/push.service', () => ({
  pushService: {
    sendToUsers: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/email.service', () => ({
  emailService: {
    sendSRCreated: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/wait-until', () => ({
  backgroundTask: vi.fn(),
}));

// Import AFTER mocking
import { SRService } from '@/services/sr.service';

describe('SRService Concurrency Benchmark', () => {
  let srService: SRService;
  const createdSrNumbers = new Set<string>();
  let attemptsCount = 0;
  const sequenceMap = new Map<string, number>();

  beforeEach(() => {
    vi.clearAllMocks();
    srService = new SRService();
    createdSrNumbers.clear();
    sequenceMap.clear();
    attemptsCount = 0;

    // Mock Client validation
    mockPrisma.client.findUnique.mockResolvedValue({
      id: 'client-1',
      isActive: true,
      name: 'Test Client',
    } as any);

    // Mock SR.update (status history)
    mockPrisma.sR.update.mockResolvedValue({});

    // Mock user for session
    const mockUser = { id: 'user-1', roles: [] } as any;

    // Reset transaction mock to just execute callback
    mockPrisma.$transaction.mockImplementation((cb) => cb(mockPrisma));
  });

  it('handles high concurrency without retries (Optimized)', async () => {
    // Mock atomic sequence generation
    mockPrisma.sRSequence.upsert.mockImplementation(async ({ where }) => {
      const date = where.date;
      let currentSeq = sequenceMap.get(date) || 0;

      // Simulating atomic increment
      // Even with concurrency, DB locks row, so seq is always unique and incremental
      // We simulate this by simply incrementing our in-memory map which acts as the "DB state"
      // Since JS is single threaded, this is safe in the mock.

      currentSeq += 1;
      sequenceMap.set(date, currentSeq);

      // Simulate a tiny delay to allow concurrency to overlap
      await new Promise((r) => setTimeout(r, 1));

      return { date, seq: currentSeq };
    });

    mockPrisma.sR.create.mockImplementation(async ({ data }) => {
      attemptsCount++;
      const srNumber = data.srNumber;

      // Simulate unique constraint check
      if (createdSrNumbers.has(srNumber)) {
        throw new PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`srNumber`)',
          {
            code: 'P2002',
            clientVersion: '5.0.0',
            meta: { target: ['srNumber'] },
          } as any
        );
      }
      createdSrNumbers.add(srNumber);
      return { ...data, id: 'sr-id-' + srNumber, createdAt: new Date() };
    });

    const concurrency = 10;
    const mockUser = { id: 'user-1', roles: [] } as any;
    const inputData = {
      title: 'Test SR',
      description: 'Description must be long enough',
      clientId: 'client-1',
      serviceCategoryId: 'cat-1',
      requestedPriority: 'MEDIUM' as const,
    };

    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      promises.push(srService.createSR(inputData, mockUser).catch((e) => e));
    }

    await Promise.all(promises);

    console.log(`Created: ${createdSrNumbers.size}, Total Attempts: ${attemptsCount}`);

    // Check results
    expect(createdSrNumbers.size).toBe(concurrency);
    expect(attemptsCount).toBe(concurrency); // Attempts should equal concurrency (1 attempt per request)
  });
});
