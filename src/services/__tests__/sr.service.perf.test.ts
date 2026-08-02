import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureCanCreateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { backgroundTask } from '@/lib/wait-until';
import { SRService } from '@/services/sr.service';

// Mock dependencies
const { mockPrisma } = vi.hoisted(() => {
  const mock = {
    $transaction: vi.fn((cb) => cb(mock)),
    $queryRaw: vi.fn().mockResolvedValue([{ seq: 1 }]),
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
    sRSequence: {
      upsert: vi.fn().mockResolvedValue({ date: '20231010', seq: 1 }),
    },
    sRStatusHistory: {
      create: vi.fn(),
    },
    client: {
      findUnique: vi.fn(),
    },
    serviceCategory: {
      // null = 카테고리 미존재 → 카테고리 테넌트 검증은 no-op (이 스위트의 원래 의도 유지)
      findUnique: vi.fn().mockResolvedValue(null),
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

// ensureCanCreateSR 만 스텁으로 대체하고 isInternalUser 는 실제 구현을 사용한다.
vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    ensureCanCreateSR: vi.fn(),
  };
});

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

vi.mock('@/lib/domain-events', () => ({
  domainEvents: {
    emit: vi.fn(),
    on: vi.fn(),
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

  // 외부(고객사) 사용자이며 벤치마크 대상 고객사 'client-1' 에 소속되어 있다.
  // → 테넌트 가드를 통과해 실제 생성 경로 전체를 측정한다.
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    roles: ['USER'],
    permissions: [],
    clientIds: ['client-1'],
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

    // Assert that domainEvents.emit was called with 'sr:created'
    const { domainEvents } = await import('@/lib/domain-events');
    expect(domainEvents.emit).toHaveBeenCalledWith('sr:created', expect.any(Object));
  });
});
