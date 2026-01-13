import { describe, it, expect, vi } from 'vitest';
import { validateFile, validateFileSize, validateFileExtension, FileValidationError, ALLOWED_FILE_TYPES } from '../file-validator';

// Mock file-type library
vi.mock('file-type', () => ({
    fileTypeFromBuffer: vi.fn(),
}));

import { fileTypeFromBuffer } from 'file-type';

describe('FileValidator', () => {
    describe('validateFileSize', () => {
        it('should pass if size is within limit', () => {
            expect(() => validateFileSize(100, 1000)).not.toThrow();
        });

        it('should throw if size exceeds limit', () => {
            expect(() => validateFileSize(1001, 1000)).toThrow(FileValidationError);
        });
    });

    describe('validateFileExtension', () => {
        it('should pass for safe extensions', () => {
            expect(() => validateFileExtension('test.jpg')).not.toThrow();
            expect(() => validateFileExtension('test.pdf')).not.toThrow();
        });

        it('should throw for dangerous extensions', () => {
            expect(() => validateFileExtension('malware.exe')).toThrow(FileValidationError);
            expect(() => validateFileExtension('script.sh')).toThrow(FileValidationError);
        });
    });

    describe('validateFile', () => {
        it('should pass for valid image file', async () => {
            const mockFile = {
                name: 'test.png',
                size: 1024,
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
            } as unknown as File;

            (fileTypeFromBuffer as any).mockResolvedValue({ mime: 'image/png' });

            const result = await validateFile(mockFile);
            expect(result).toEqual({ mimeType: 'image/png', size: 1024 });
        });

        it('should throw if MIME type is not allowed', async () => {
            const mockFile = {
                name: 'unknown.xyz',
                size: 1024,
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
            } as unknown as File;

            (fileTypeFromBuffer as any).mockResolvedValue({ mime: 'application/unknown' });

            await expect(validateFile(mockFile)).rejects.toThrow('허용되지 않은 파일 형식입니다');
        });

        it('should throw if extension does not match MIME type', async () => {
            const mockFile = {
                name: 'test.jpg', // Extension says jpg
                size: 1024,
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
            } as unknown as File;

            // Content says png
            (fileTypeFromBuffer as any).mockResolvedValue({ mime: 'image/png' });

            await expect(validateFile(mockFile)).rejects.toThrow('파일 확장자(.jpg)와 실제 파일 형식(image/png)이 일치하지 않습니다');
        });

        it('should handle text files correctly', async () => {
            const mockFile = {
                name: 'test.txt',
                size: 1024,
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
            } as unknown as File;

            // file-type returns undefined for text files
            (fileTypeFromBuffer as any).mockResolvedValue(undefined);

            const result = await validateFile(mockFile);
            expect(result).toEqual({ mimeType: 'text/plain', size: 1024 });
        });
    });
});
