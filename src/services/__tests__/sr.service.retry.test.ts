import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureCanCreateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SRService } from '@/services/sr.service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    client: { findUnique: vi.fn().mockResolvedValue(null) },
    sR: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sRActivity: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    sRStatusHistory: {
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    sRComment: { deleteMany: vi.fn().mockResolvedValue({}) },
    sRAttachment: { deleteMany: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock('@/lib/policies', () => ({
  ensureCanCreateSR: vi.fn(),
}));

vi.mock('@prisma/client/runtime/library', () => ({
  PrismaClientKnownRequestError: class extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.code = code;
    }
  },
}));

describe('SRService - Retry Logic', () => {
  let srService: SRService;

  beforeEach(() => {
    vi.clearAllMocks();
    srService = new SRService();
  });

  it('retries SR number generation on P2002 error', async () => {
    vi.mocked(ensureCanCreateSR).mockReturnValue(undefined);
    vi.mocked(prisma.client.findUnique).mockResolvedValue({ id: 'c-1', isActive: true } as any);

    const txMock = {
      sR: {
        findFirst: vi.fn().mockResolvedValue({ srNumber: 'SR-20231010-0001' }),
        create: vi
          .fn()
          .mockRejectedValueOnce(
            new PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: '5.0.0',
            } as any)
          )
          .mockResolvedValueOnce({ id: 'sr-1', srNumber: 'SR-20231010-0002' } as any),
      },
      sRActivity: { create: vi.fn() },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(txMock));

    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      srNumber: 'SR-20231010-0002',
      title: 'Valid Title',
      requester: { name: 'R', notificationPreference: {} },
      serviceCategory: { categoryName: 'C' },
    } as any);

    await srService.createSR(
      {
        title: 'Valid Title Long Enough',
        description: 'Description Longer Than Ten Characters',
        clientId: 'c-1',
        serviceCategoryId: 'cat-1',
        requestedPriority: 'MEDIUM',
      },
      { id: 'u1' } as any
    );

    expect(txMock.sR.create).toHaveBeenCalledTimes(2);
  });
});
