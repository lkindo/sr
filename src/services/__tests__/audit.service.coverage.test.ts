import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';

import { AuditService, auditService } from '../audit.service';

vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    auditLog: {
      create: vi.fn(),
    },
  };
  return { default: mockPrisma };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AuditService.createLog', () => {
  let service: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuditService();
  });

  it('exports a singleton instance', () => {
    expect(auditService).toBeInstanceOf(AuditService);
  });

  it('passes object changes through unchanged using default prisma client when tx is null', async () => {
    const changesObj = { before: { x: 1 }, after: { x: 2 } };

    await service.createLog(null, {
      userId: 'user-1',
      actionType: 'UPDATE',
      targetEntity: 'SR',
      targetId: 'sr-1',
      changes: changesObj,
      ipAddress: '10.0.0.1',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        actionType: 'UPDATE',
        targetEntity: 'SR',
        targetId: 'sr-1',
        changes: changesObj,
        ipAddress: '10.0.0.1',
      },
    });
  });

  it('parses a valid JSON string into an object for the changes column', async () => {
    const jsonString = JSON.stringify({ field: 'value', n: 42 });

    await service.createLog(null, {
      actionType: 'CREATE',
      targetEntity: 'User',
      changes: jsonString,
    });

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as any;
    expect(callArg.data.changes).toEqual({ field: 'value', n: 42 });
    // not the raw string
    expect(typeof callArg.data.changes).toBe('object');
  });

  it('keeps an invalid JSON string as a string scalar', async () => {
    const invalid = 'this is not json {';

    await service.createLog(null, {
      actionType: 'NOTE',
      targetEntity: 'SR',
      changes: invalid,
    });

    const callArg = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as any;
    expect(callArg.data.changes).toBe(invalid);
  });

  it('defaults optional fields (userId, targetId, ipAddress) to null', async () => {
    await service.createLog(null, {
      actionType: 'DELETE',
      targetEntity: 'Role',
      changes: { removed: true },
    });

    const callArg = vi.mocked(prisma.auditLog.create).mock.calls[0][0] as any;
    expect(callArg.data.userId).toBeNull();
    expect(callArg.data.targetId).toBeNull();
    expect(callArg.data.ipAddress).toBeNull();
  });

  it('uses the provided tx client instead of the default prisma client', async () => {
    const tx = {
      auditLog: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };

    await service.createLog(tx, {
      userId: 'u',
      actionType: 'UPDATE',
      targetEntity: 'SR',
      targetId: 't',
      changes: { a: 1 },
      ipAddress: null,
    });

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('warns and skips when the client has no auditLog delegate', async () => {
    const tx = {}; // no auditLog

    await service.createLog(tx, {
      actionType: 'UPDATE',
      targetEntity: 'SR',
      changes: { a: 1 },
    });

    expect(logger.warn).toHaveBeenCalledWith(
      '[AuditService] auditLog.create is not defined on client. Skipping DB log.'
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('warns and skips when auditLog.create is not a function', async () => {
    const tx = { auditLog: { create: 'not-a-function' } };

    await service.createLog(tx, {
      actionType: 'UPDATE',
      targetEntity: 'SR',
      changes: { a: 1 },
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('logs the error and rethrows when create throws', async () => {
    const boom = new Error('db down');
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(boom);

    await expect(
      service.createLog(null, {
        actionType: 'UPDATE',
        targetEntity: 'SR',
        targetId: 'sr-9',
        changes: { a: 1 },
      })
    ).rejects.toThrow('db down');

    expect(logger.error).toHaveBeenCalledWith('[AuditService] Failed to create audit log', boom, {
      actionType: 'UPDATE',
      targetEntity: 'SR',
      targetId: 'sr-9',
    });
  });

  it('passes targetId as undefined in error context when not provided', async () => {
    const boom = new Error('fail');
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(boom);

    await expect(
      service.createLog(null, {
        actionType: 'CREATE',
        targetEntity: 'User',
        changes: { a: 1 },
      })
    ).rejects.toThrow('fail');

    const ctx = vi.mocked(logger.error).mock.calls[0][2] as any;
    expect(ctx.targetId).toBeUndefined();
  });
});
