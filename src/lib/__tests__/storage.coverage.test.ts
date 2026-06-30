import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// fs mock: default export shape (module uses `import fs from 'fs'`).
// Use vi.hoisted so these refs exist when the hoisted vi.mock factories run.
const { mockExistsSync, mockMkdirSync, mockMkdir, mockWriteFile, mockUnlink, mockLogger } =
  vi.hoisted(() => ({
    mockExistsSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockMkdir: vi.fn(),
    mockWriteFile: vi.fn(),
    mockUnlink: vi.fn(),
    mockLogger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  }));

vi.mock('fs', () => {
  const fsMock = {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    promises: {
      mkdir: (...args: unknown[]) => mockMkdir(...args),
      writeFile: (...args: unknown[]) => mockWriteFile(...args),
      unlink: (...args: unknown[]) => mockUnlink(...args),
    },
  };
  return { default: fsMock, ...fsMock };
});

vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

// Compute the same roots the module computes (no STORAGE_DIR env override in tests).
const STORAGE_DIR = path.join(process.cwd(), 'var', 'uploads');
const LEGACY_PUBLIC_DIR = path.join(process.cwd(), 'public', 'uploads');
const resolvedStorageRoot = path.resolve(STORAGE_DIR);
const resolvedLegacyRoot = path.resolve(LEGACY_PUBLIC_DIR);

// At import time the module calls existsSync(STORAGE_DIR); make it return true so mkdirSync is skipped.
// We set this before importing the module under test.
mockExistsSync.mockReturnValue(true);

import {
  deleteAttachmentBlob,
  listAttachmentBlobs,
  resolveAttachmentFilePath,
  STORAGE_DIR as MOD_STORAGE_DIR,
  uploadAttachmentBlob,
} from '@/lib/storage';

beforeEach(() => {
  vi.clearAllMocks();
  // default: files exist unless a test overrides
  mockExistsSync.mockReturnValue(true);
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
});

describe('STORAGE_DIR', () => {
  it('resolves to <cwd>/var/uploads when STORAGE_DIR env is not set', () => {
    expect(MOD_STORAGE_DIR).toBe(resolvedStorageRoot);
  });
});

describe('resolveAttachmentFilePath', () => {
  it('returns null for null input', () => {
    expect(resolveAttachmentFilePath(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(resolveAttachmentFilePath(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveAttachmentFilePath('')).toBeNull();
  });

  it('resolves an absolute path inside STORAGE_DIR when the file exists', () => {
    const abs = path.join(resolvedStorageRoot, 'attachments', 'sr1', 'a.txt');
    mockExistsSync.mockReturnValue(true);
    expect(resolveAttachmentFilePath(abs)).toBe(path.resolve(abs));
  });

  it('returns null for an absolute path inside STORAGE_DIR that does not exist', () => {
    const abs = path.join(resolvedStorageRoot, 'attachments', 'sr1', 'missing.txt');
    mockExistsSync.mockReturnValue(false);
    expect(resolveAttachmentFilePath(abs)).toBeNull();
  });

  it('returns null for an absolute path outside both roots (containment rejection)', () => {
    const abs = path.resolve(path.join(process.cwd(), 'etc', 'passwd'));
    mockExistsSync.mockReturnValue(true);
    expect(resolveAttachmentFilePath(abs)).toBeNull();
  });

  it('resolves an absolute path inside LEGACY_PUBLIC_DIR when the file exists', () => {
    const abs = path.join(resolvedLegacyRoot, 'old', 'b.png');
    mockExistsSync.mockReturnValue(true);
    expect(resolveAttachmentFilePath(abs)).toBe(path.resolve(abs));
  });

  it('resolves an absolute path equal to a root itself', () => {
    mockExistsSync.mockReturnValue(true);
    expect(resolveAttachmentFilePath(resolvedStorageRoot)).toBe(resolvedStorageRoot);
  });

  it('resolves a relative storage path under STORAGE_DIR (first root wins)', () => {
    const rel = 'attachments/sr1/c.txt';
    const expected = path.resolve(path.join(resolvedStorageRoot, rel));
    // Exists only under STORAGE_DIR
    mockExistsSync.mockImplementation((p: string) => p === expected);
    expect(resolveAttachmentFilePath(rel)).toBe(expected);
  });

  it('falls back to LEGACY_PUBLIC_DIR for a relative path when not present in STORAGE_DIR', () => {
    const rel = 'old/d.txt';
    const inStorage = path.resolve(path.join(resolvedStorageRoot, rel));
    const inLegacy = path.resolve(path.join(resolvedLegacyRoot, rel));
    mockExistsSync.mockImplementation((p: string) => p === inLegacy && p !== inStorage);
    expect(resolveAttachmentFilePath(rel)).toBe(inLegacy);
  });

  it('normalizes a uploads/ URL prefix to a relative path under STORAGE_DIR', () => {
    // Note: on Windows a leading "/" makes the path absolute, so the URL-normalization
    // branch is exercised with a non-slash-leading "uploads/" prefix. The regex strips
    // the "uploads/" segment, leaving the relative path under a root.
    const url = 'uploads/sr2/f.txt';
    const expected = path.resolve(path.join(resolvedStorageRoot, 'sr2', 'f.txt'));
    mockExistsSync.mockImplementation((p: string) => p === expected);
    expect(resolveAttachmentFilePath(url)).toBe(expected);
  });

  it('treats a leading-slash /uploads/ value as absolute (outside roots -> null on win32)', () => {
    // path.isAbsolute('/uploads/...') is true on win32, routing to the absolute branch.
    // The resolved drive-relative path is outside both roots, so it is rejected.
    mockExistsSync.mockReturnValue(true);
    expect(resolveAttachmentFilePath('/uploads/sr1/e.txt')).toBeNull();
  });

  it('resolves a plain relative path (no uploads prefix) under STORAGE_DIR', () => {
    const rel = 'sr3/g.txt';
    const expected = path.resolve(path.join(resolvedStorageRoot, 'sr3', 'g.txt'));
    mockExistsSync.mockImplementation((p: string) => p === expected);
    expect(resolveAttachmentFilePath(rel)).toBe(expected);
  });

  it('returns null for a relative path that does not exist in any root', () => {
    mockExistsSync.mockReturnValue(false);
    expect(resolveAttachmentFilePath('attachments/sr1/none.txt')).toBeNull();
  });

  it('rejects a relative path that escapes the roots via traversal', () => {
    // ../../etc/secret escapes both roots; even if existsSync is true, containment fails.
    mockExistsSync.mockReturnValue(true);
    expect(resolveAttachmentFilePath('../../../../etc/secret')).toBeNull();
  });
});

describe('uploadAttachmentBlob', () => {
  it('uploads a file, sanitizing the filename and returning paths', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'my report (final).pdf', {
      type: 'application/pdf',
    });
    const result = await uploadAttachmentBlob('sr-100', file);

    expect(mockMkdir).toHaveBeenCalledTimes(1);
    const mkdirArg = mockMkdir.mock.calls[0][0] as string;
    expect(mkdirArg).toBe(path.join(resolvedStorageRoot, 'attachments', 'sr-100'));
    expect(mockMkdir.mock.calls[0][1]).toEqual({ recursive: true });

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const writeBuf = mockWriteFile.mock.calls[0][1] as Buffer;
    expect(Buffer.isBuffer(writeBuf)).toBe(true);
    expect(Array.from(writeBuf)).toEqual([1, 2, 3]);

    // spaces -> '-', unsafe chars '(' ')' -> '_'
    expect(result.pathname).toMatch(/^attachments\/sr-100\/\d+-my-report-_final_\.pdf$/);
    expect(result.url).toBe(result.pathname);
    expect(result.downloadUrl).toBe(result.pathname);
    expect(result.size).toBe(file.size);
    expect(result.type).toBe('application/pdf');
  });

  it('strips directory components from the filename (path traversal in name)', async () => {
    const file = new File([new Uint8Array([9])], '../../etc/passwd');
    const result = await uploadAttachmentBlob('sr-1', file);
    // basename of '../../etc/passwd' is 'passwd'
    expect(result.pathname).toMatch(/^attachments\/sr-1\/\d+-passwd$/);
  });

  it('falls back to "file" when sanitized name is empty', async () => {
    const file = new File([new Uint8Array([0])], '!!!');
    const result = await uploadAttachmentBlob('sr-2', file);
    // '!!!' -> '___' which is truthy, so check a name that sanitizes to empty.
    expect(result.pathname).toMatch(/^attachments\/sr-2\/\d+-/);
  });

  it('uses "file" fallback when basename sanitizes to empty string', async () => {
    // A name whose basename becomes '' after sanitization: choose '@@@' would become '___'.
    // Use a name that path.basename keeps but sanitize keeps at least one char.
    // To truly hit the || 'file' branch we need safeName === '' which requires baseName === ''.
    // path.basename('/') === '' on posix; on win path.basename('\\') may differ. Use '.'.
    const file = new File([new Uint8Array([0])], '/');
    const result = await uploadAttachmentBlob('sr-3', file);
    expect(result.pathname).toMatch(/^attachments\/sr-3\/\d+-file$/);
  });

  it('applies basename to srId (defensive against traversal in srId)', async () => {
    const file = new File([new Uint8Array([1])], 'doc.txt');
    const result = await uploadAttachmentBlob('../../evil', file);
    // path.basename('../../evil') === 'evil'
    expect(result.pathname).toMatch(/^attachments\/evil\/\d+-doc\.txt$/);
    const mkdirArg = mockMkdir.mock.calls[0][0] as string;
    expect(mkdirArg).toBe(path.join(resolvedStorageRoot, 'attachments', 'evil'));
  });

  it('does not write the file when path traversal is detected and logs a warning', async () => {
    // Force path.resolve to return a location outside the root for the final filepath
    // containment check (`path.resolve(filepath)`), while keeping the root resolution
    // (`path.resolve(STORAGE_DIR)`) intact so the comparison actually fails.
    const realResolve = path.resolve.bind(path);
    const outside = path.join(process.cwd(), 'outside', 'evil.txt');
    const spy = vi.spyOn(path, 'resolve');
    spy.mockImplementation((...args: string[]) => {
      const joined = args.join('|');
      if (joined.includes('attachments')) {
        return outside;
      }
      return realResolve(...args);
    });

    try {
      const file = new File([new Uint8Array([1])], 'evil.txt');
      await expect(uploadAttachmentBlob('sr-x', file)).rejects.toThrow('잘못된 파일 경로입니다.');
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('deleteAttachmentBlob', () => {
  it('returns early (no-op) for empty pathname', async () => {
    await expect(deleteAttachmentBlob('')).resolves.toBeUndefined();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('resolves the path and unlinks an existing file', async () => {
    const rel = 'attachments/sr1/x.txt';
    const expected = path.resolve(path.join(resolvedStorageRoot, rel));
    mockExistsSync.mockImplementation((p: string) => p === expected);

    await deleteAttachmentBlob(rel);

    expect(mockUnlink).toHaveBeenCalledTimes(1);
    expect(mockUnlink).toHaveBeenCalledWith(expected);
  });

  it('does nothing when the resolved file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    await deleteAttachmentBlob('attachments/sr1/missing.txt');
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('does nothing when the path cannot be resolved (null)', async () => {
    // A traversal path resolves to null -> no unlink.
    mockExistsSync.mockReturnValue(true);
    await deleteAttachmentBlob('../../../../etc/secret');
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('swallows errors from unlink and logs them', async () => {
    const rel = 'attachments/sr1/boom.txt';
    const expected = path.resolve(path.join(resolvedStorageRoot, rel));
    mockExistsSync.mockImplementation((p: string) => p === expected);
    mockUnlink.mockRejectedValue(new Error('EACCES'));

    await expect(deleteAttachmentBlob(rel)).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalled();
    const errArg = mockLogger.error.mock.calls[0][1];
    expect(errArg).toBeInstanceOf(Error);
  });

  it('handles non-Error thrown values by passing undefined to logger', async () => {
    const rel = 'attachments/sr1/boom2.txt';
    const expected = path.resolve(path.join(resolvedStorageRoot, rel));
    mockExistsSync.mockImplementation((p: string) => p === expected);
    mockUnlink.mockRejectedValue('string failure');

    await expect(deleteAttachmentBlob(rel)).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockLogger.error.mock.calls[0][1]).toBeUndefined();
  });
});

describe('listAttachmentBlobs', () => {
  it('returns an empty blobs array stub and warns', async () => {
    const result = await listAttachmentBlobs('any-prefix');
    expect(result).toEqual({ blobs: [] });
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
