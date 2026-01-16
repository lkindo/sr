import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

// Mock app-url
vi.mock('@/lib/app-url', () => ({
    getAppUrl: vi.fn(() => 'http://localhost:3000'),
}));

// Mock react-email render
vi.mock('@react-email/render', () => ({
    render: vi.fn().mockResolvedValue('<html>Mocked Email</html>'),
}));

// Mock email templates
vi.mock('@/emails/SRCreatedEmail', () => ({
    default: vi.fn(() => 'SRCreatedEmail'),
}));
vi.mock('@/emails/SRStatusChangedEmail', () => ({
    default: vi.fn(() => 'SRStatusChangedEmail'),
}));
vi.mock('@/emails/SRAssignedEmail', () => ({
    default: vi.fn(() => 'SRAssignedEmail'),
}));

describe('Email Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('sendSRCreatedEmail', () => {
        const defaultParams = {
            to: 'recipient@example.com',
            srId: 'sr-123',
            srNumber: 'SR-2024-001',
            title: 'Test SR',
            description: 'Test description',
            priority: 'HIGH',
            clientName: 'Test Client',
            requesterName: 'John Doe',
            requesterEmail: 'john@example.com',
        };

        it('should return null when RESEND_API_KEY is not configured', async () => {
            // Ensure no API key
            delete process.env.RESEND_API_KEY;
            vi.resetModules();

            const { sendSRCreatedEmail } = await import('../email');
            const result = await sendSRCreatedEmail(defaultParams);
            expect(result).toBeNull();
        });
    });

    describe('sendSRStatusChangedEmail', () => {
        const defaultParams = {
            to: 'recipient@example.com',
            srId: 'sr-123',
            srNumber: 'SR-2024-001',
            title: 'Test SR',
            fromStatus: 'REQUESTED',
            toStatus: 'IN_PROGRESS',
            changeReason: 'Work started',
            changedByName: 'Admin User',
            clientName: 'Test Client',
        };

        it('should return null when RESEND_API_KEY is not configured', async () => {
            delete process.env.RESEND_API_KEY;
            vi.resetModules();

            const { sendSRStatusChangedEmail } = await import('../email');
            const result = await sendSRStatusChangedEmail(defaultParams);
            expect(result).toBeNull();
        });
    });

    describe('sendSRAssignedEmail', () => {
        const defaultParams = {
            to: 'assignee@example.com',
            srId: 'sr-123',
            srNumber: 'SR-2024-001',
            title: 'Test SR',
            description: 'Test description',
            priority: 'HIGH',
            clientName: 'Test Client',
            assignedToName: 'Engineer',
            assignedByName: 'Manager',
        };

        it('should return null when RESEND_API_KEY is not configured', async () => {
            delete process.env.RESEND_API_KEY;
            vi.resetModules();

            const { sendSRAssignedEmail } = await import('../email');
            const result = await sendSRAssignedEmail(defaultParams);
            expect(result).toBeNull();
        });
    });

    describe('sendCommentNotificationEmail', () => {
        const defaultParams = {
            to: 'user@example.com',
            srId: 'sr-123',
            srNumber: 'SR-2024-001',
            title: 'Test SR',
            commentAuthor: 'Commenter',
            commentContent: 'This is a comment',
        };

        it('should return null when RESEND_API_KEY is not configured', async () => {
            delete process.env.RESEND_API_KEY;
            vi.resetModules();

            const { sendCommentNotificationEmail } = await import('../email');
            const result = await sendCommentNotificationEmail(defaultParams);
            expect(result).toBeNull();
        });
    });
});
