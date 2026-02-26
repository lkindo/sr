import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureCanUpdateSR } from '@/lib/policies';
import prisma from '@/lib/prisma';
import { SRService } from '@/services/sr.service';
import { AuthenticatedUser } from '@/types/session';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn((cb) => cb(prisma)),
    sR: { findUnique: vi.fn(), update: vi.fn() },
    client: { findUnique: vi.fn() },
    serviceCategory: { findUnique: vi.fn() },
    sRActivity: { create: vi.fn() },
  },
}));

vi.mock('@/lib/policies', () => ({
  ensureCanUpdateSR: vi.fn(),
  ensureCanCreateSR: vi.fn(),
  isInternalUser: (user: any) => ['ADMIN', 'MANAGER', 'ENGINEER'].some((role: string) => user.roles.includes(role)),
}));

vi.mock('@/lib/realtime-events', () => ({
  emitRealtimeEvent: vi.fn(),
  REALTIME_EVENTS: { SR_UPDATED: 'SR_UPDATED' },
}));

vi.mock('@/services/push.service', () => ({
  pushService: { sendToUser: vi.fn() },
}));

vi.mock('@/services/email.service', () => ({
  emailService: { sendSRStatusChanged: vi.fn(), sendSRAssigned: vi.fn() },
}));

describe('SRService Security Vulnerability Reproduction', () => {
  let srService: SRService;

  beforeEach(() => {
    vi.clearAllMocks();
    srService = new SRService();
  });

  it('prevents a CLIENT user from changing priority (SECURITY FIXED)', async () => {
    // 1. Mock existing SR
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'client-1',
      priority: 'LOW',
      requesterId: 'user-client',
      srNumber: 'SR-20231010-0001',
      title: 'Test SR',
    } as any);

    // Mock update return value
    vi.mocked(prisma.sR.update).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'client-1',
      priority: 'LOW', // Remains LOW
      requesterId: 'user-client',
      srNumber: 'SR-20231010-0001',
      title: 'New Title',
    } as any);

    // 2. Mock policy check to pass
    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    // 3. Simulate a Client User
    const clientUser: AuthenticatedUser = {
      id: 'user-client',
      email: 'client@example.com',
      name: 'Client User',
      image: null,
      roles: ['USER'],
      permissions: ['SR:UPDATE_SELF'],
      clientIds: ['client-1'],
    };

    // 4. Client tries to escalate priority to CRITICAL along with a valid title update
    await srService.updateSR('sr-1', { priority: 'CRITICAL', title: 'New Title' }, clientUser);

    // 5. Check if update was called WITHOUT priority but WITH title
    const updateCall = vi.mocked(prisma.sR.update).mock.calls[0];
    const updateData = updateCall[0].data;

    expect(updateData).not.toHaveProperty('priority');
    expect(updateData.title).toBe('New Title');
  });

  it('prevents a CLIENT user from assigning an engineer (SECURITY FIXED)', async () => {
    // 1. Mock existing SR
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'client-1',
      assigneeId: null,
      requesterId: 'user-client',
      srNumber: 'SR-20231010-0001',
      title: 'Test SR',
    } as any);

    // Mock update return value
    vi.mocked(prisma.sR.update).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'client-1',
      assigneeId: null, // Remains null
      requesterId: 'user-client',
      srNumber: 'SR-20231010-0001',
      title: 'New Title',
      assignee: null,
    } as any);

    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    const clientUser: AuthenticatedUser = {
      id: 'user-client',
      email: 'client@example.com',
      name: 'Client User',
      image: null,
      roles: ['USER'],
      permissions: ['SR:UPDATE_SELF'],
      clientIds: ['client-1'],
    };

    // 4. Client tries to assign an engineer along with a valid title update
    await srService.updateSR('sr-1', { assigneeId: 'engineer-1', title: 'New Title' }, clientUser);

    const updateCall = vi.mocked(prisma.sR.update).mock.calls[0];
    const updateData = updateCall[0].data;

    expect(updateData).not.toHaveProperty('assigneeId');
    expect(updateData.title).toBe('New Title');
  });

  it('allows an ADMIN user to change priority', async () => {
    // 1. Mock existing SR
    vi.mocked(prisma.sR.findUnique).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'client-1',
      priority: 'LOW',
      requesterId: 'user-client',
      srNumber: 'SR-20231010-0001',
      title: 'Test SR',
    } as any);

    // Mock update return value
    vi.mocked(prisma.sR.update).mockResolvedValue({
      id: 'sr-1',
      status: 'REQUESTED',
      clientId: 'client-1',
      priority: 'CRITICAL',
      requesterId: 'user-client',
      srNumber: 'SR-20231010-0001',
      title: 'Test SR',
    } as any);

    vi.mocked(ensureCanUpdateSR).mockReturnValue(undefined);

    const adminUser: AuthenticatedUser = {
      id: 'user-admin',
      email: 'admin@example.com',
      name: 'Admin User',
      image: null,
      roles: ['ADMIN'],
      permissions: [],
      clientIds: [],
    };

    // 4. Admin tries to escalate priority to CRITICAL
    await srService.updateSR('sr-1', { priority: 'CRITICAL' }, adminUser);

    // 5. Check if update was called WITH priority
    const updateCall = vi.mocked(prisma.sR.update).mock.calls[0];
    const updateData = updateCall[0].data;

    expect(updateData.priority).toBe('CRITICAL');
  });
});
