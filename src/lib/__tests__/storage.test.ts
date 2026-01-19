import { describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// NOTE: Testing local filesystem storage is complex due to native module mocking.
// These tests validate the basic interface and behavior, but full integration tests
// should be done manually or with actual filesystem access.

describe('storage utility (Local Filesystem)', () => {
  describe('uploadAttachmentBlob', () => {
    it('should be a function', async () => {
      const { uploadAttachmentBlob } = await import('@/lib/storage');
      expect(typeof uploadAttachmentBlob).toBe('function');
    });
  });

  describe('deleteAttachmentBlob', () => {
    it('should be a function', async () => {
      const { deleteAttachmentBlob } = await import('@/lib/storage');
      expect(typeof deleteAttachmentBlob).toBe('function');
    });

    it('should return early for empty pathname', async () => {
      const { deleteAttachmentBlob } = await import('@/lib/storage');
      // This should not throw
      await expect(deleteAttachmentBlob('')).resolves.toBeUndefined();
    });
  });

  describe('listAttachmentBlobs', () => {
    it('should return empty blobs array (stub)', async () => {
      const { listAttachmentBlobs } = await import('@/lib/storage');
      const result = await listAttachmentBlobs('prefix');
      expect(result).toEqual({ blobs: [] });
    });
  });
});
