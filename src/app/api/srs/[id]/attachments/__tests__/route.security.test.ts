/**
 * @vitest-environment node
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  ensureCanUpdateSR: vi.fn(),
  ensureCanReadSR: vi.fn(),
  prismaSRFindUnique: vi.fn(),
  prismaAttachmentFindMany: vi.fn(),
  prismaAttachmentCreateMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    sR: {
      findUnique: mocks.prismaSRFindUnique,
    },
    sRAttachment: {
      findMany: mocks.prismaAttachmentFindMany,
      createManyAndReturn: mocks.prismaAttachmentCreateMany,
    },
  },
}));

vi.mock('@/lib/policies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/policies')>();
  return {
    ...actual,
    ensureCanUpdateSR: mocks.ensureCanUpdateSR,
    ensureCanReadSR: mocks.ensureCanReadSR,
  };
});

vi.mock('@/lib/auth-wrapper', () => ({
  withAuthAndRateLimit: (handler: any) => handler,
}));

// Mock file system for POST
vi.mock('fs', () => ({
  createWriteStream: vi.fn(),
}));
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

// Import handlers
import { GET, POST } from '../route';

describe('API Route Security: /api/srs/[id]/attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET Handler', () => {
    it('should verify read permission for the SR before fetching attachments', async () => {
      // Setup
      const srId = 'sr-123';
      const mockSession = { user: { id: 'user-1' } };
      const mockSR = { id: srId, clientId: 'client-1' };

      mocks.prismaSRFindUnique.mockResolvedValue(mockSR);
      mocks.prismaAttachmentFindMany.mockResolvedValue([]);

      // Act
      const req = new NextRequest(`http://localhost/api/srs/${srId}/attachments`);
      await (GET as any)(req, { session: mockSession, params: Promise.resolve({ id: srId }) });

      // Assert
      expect(mocks.prismaSRFindUnique).toHaveBeenCalledWith({ where: { id: srId } });
      expect(mocks.ensureCanReadSR).toHaveBeenCalledWith(mockSession.user, mockSR);
      expect(mocks.prismaAttachmentFindMany).toHaveBeenCalledWith({
        where: { srId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should throw NotFoundError if SR does not exist', async () => {
      // Setup
      const srId = 'sr-missing';
      const mockSession = { user: { id: 'user-1' } };

      mocks.prismaSRFindUnique.mockResolvedValue(null);

      // Act & Assert
      const req = new NextRequest(`http://localhost/api/srs/${srId}/attachments`);
      await expect(
        (GET as any)(req, { session: mockSession, params: Promise.resolve({ id: srId }) })
      ).rejects.toThrow(); // Check for any error, or specific message if consistent
    });
  });

  describe('POST Handler', () => {
    it('should verify update permission for the SR before uploading', async () => {
      // Setup
      const srId = 'sr-123';
      const mockSession = { user: { id: 'user-1' } };
      const mockSR = { id: srId, clientId: 'client-1' };

      mocks.prismaSRFindUnique.mockResolvedValue(mockSR);

      // Create a mock FormData with a file
      const formData = new FormData();
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      formData.append('files', file);

      const req = new NextRequest(`http://localhost/api/srs/${srId}/attachments`, {
        method: 'POST',
        body: formData,
      });

      // Act
      try {
        await (POST as any)(req, { session: mockSession, params: Promise.resolve({ id: srId }) });
      } catch (e) {
        // Ignore errors related to file validation/processing which might fail in mock environment
        // We only care about permission check
      }

      // Assert
      expect(mocks.prismaSRFindUnique).toHaveBeenCalledWith({ where: { id: srId } });
      expect(mocks.ensureCanUpdateSR).toHaveBeenCalledWith(mockSession.user, mockSR);
    });
  });
});
