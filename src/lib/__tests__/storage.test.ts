import { describe, it, expect, vi } from 'vitest';
import { uploadAttachmentBlob, deleteAttachmentBlob } from '@/lib/storage';
import { put, del } from '@vercel/blob';

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
    describe('uploadAttachmentBlob', () => {
        it('should upload file with modified pathname', async () => {
            const mockBlob = {
                url: 'https://blob.com/test.png',
                pathname: 'attachments/sr-1/123-test.png',
                downloadUrl: 'https://blob.com/test.png?download=1',
            };
            vi.mocked(put).mockResolvedValue(mockBlob as any);

            // Mock File object
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
    });

    describe('deleteAttachmentBlob', () => {
        it('should call del if pathname is provided', async () => {
            await deleteAttachmentBlob('some-path');
            expect(del).toHaveBeenCalledWith('some-path', expect.any(Object));
        });

        it('should not call del if pathname is empty', async () => {
            vi.clearAllMocks();
            await deleteAttachmentBlob('');
            expect(del).not.toHaveBeenCalled();
        });
    });
});
