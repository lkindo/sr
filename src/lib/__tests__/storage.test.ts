import { del, list, put } from '@vercel/blob';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteAttachmentBlob, listAttachmentBlobs, uploadAttachmentBlob } from '@/lib/storage';

// Mock @vercel/blob
vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
  del: vi.fn(),
  list: vi.fn(),
}));

// Mock logger to avoid noisy output
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe('storage utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  });

  describe('uploadAttachmentBlob', () => {
    it('should upload file with modified pathname', async () => {
      const mockBlob = {
        url: 'https://blob.com/test.png',
        pathname: 'attachments/sr-1/123-test.png',
        downloadUrl: 'https://blob.com/test.png?download=1',
      };
      vi.mocked(put).mockResolvedValue(mockBlob as any);

      const file = {
        name: 'test file.png',
        size: 1024,
        type: 'image/png',
      } as any;

      const result = await uploadAttachmentBlob('sr-1', file);

      expect(put).toHaveBeenCalledWith(
        expect.stringContaining('attachments/sr-1/'),
        file,
        expect.objectContaining({ access: 'public' })
      );

      expect(result.url).toBe(mockBlob.url);
      expect(result.size).toBe(1024);
    });

    it('should propagate upload errors', async () => {
      vi.mocked(put).mockRejectedValue(new Error('Upload failed'));
      const file = { name: 'test.png', size: 100, type: 'image/png' } as any;
      await expect(uploadAttachmentBlob('sr-1', file)).rejects.toThrow('Upload failed');
    });
  });

  describe('deleteAttachmentBlob', () => {
    it('should call del if pathname is provided', async () => {
      await deleteAttachmentBlob('some-path');
      expect(del).toHaveBeenCalledWith('some-path', expect.any(Object));
    });

    it('should not call del if pathname is empty', async () => {
      await deleteAttachmentBlob('');
      expect(del).not.toHaveBeenCalled();
    });
  });

  describe('listAttachmentBlobs', () => {
    it('should return list of blobs', async () => {
      const mockList = { blobs: [], cursor: 'next', hasMore: false };
      vi.mocked(list).mockResolvedValue(mockList as any);

      const result = await listAttachmentBlobs('prefix');
      expect(result).toEqual(mockList);
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'prefix' }));
    });

    it('should return null if prefix is empty', async () => {
      const result = await listAttachmentBlobs('');
      expect(result).toBeNull();
    });
  });
});
