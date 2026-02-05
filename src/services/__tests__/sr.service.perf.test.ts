import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureCanCreateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { backgroundTask } from '@/lib/wait-until';
import { SRService } from '@/services/sr.service';

// Mock dependencies
const { mockPrisma } = vi.hoisted(() => {
  const mock = {
    $transaction: vi.fn((cb) => cb(mock)),
    sR: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
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

// Mock backgroundTask to just execute the promise but not wait for it in main flow if we don't want to
// But here we just want to count findMany calls.
// The real backgroundTask does not await. But the promise passed to it is created before calling backgroundTask.
vi.mock('@/lib/wait-until', () => ({
  backgroundTask: vi.fn(),
}));

describe('SRService Performance', () => {
  let srService: SRService;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    roles: ['USER'],
    permissions: [],
    clientIds: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    srService = new SRService();
  });

  it('createSR should call prisma.user.findMany multiple times (redundant)', async () => {
    // Setup mocks for createSR success flow
    vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
    vi.mocked(prisma.client.findUnique).mockResolvedValue({
      id: 'client-1',
      isActive: true,
      name: 'Test Client',
    } as any);

    const mockSR = {
      id: 'sr-1',
      srNumber: 'SR-20231010-0001',
      title: 'New SR',
      requester: { name: 'Requester' },
      serviceCategory: { categoryName: 'Category' },
    };

    vi.mocked(prisma.sR.create).mockResolvedValue(mockSR as any);
    vi.mocked(prisma.sR.findFirst).mockResolvedValue(null); // No previous SR
    vi.mocked(prisma.sR.findUnique).mockResolvedValue(mockSR as any); // For getSRDetailsById

    // Mock user.findMany for notifications
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'admin-1', email: 'admin@example.com', notificationPreference: {} },
    ] as any);

    const data = {
      title: 'Perf Test SR',
      description: 'Description',
      clientId: 'client-1',
      serviceCategoryId: 'cat-1',
      requestedPriority: 'MEDIUM' as const,
    };

    await srService.createSR(data, mockUser);

    // Assert that user.findMany was called once
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });
});
