import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env values
const originalEnv = { ...process.env };

// Mock nodemailer at the top level
const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({
            sendMail: mockSendMail,
        })),
    },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { logger } from '@/lib/logger';

describe('EmailService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSendMail.mockResolvedValue({ messageId: 'test-123' });

        // Set test environment
        process.env.EMAIL_SERVER_USER = 'test@example.com';
        process.env.EMAIL_SERVER_PASSWORD = 'password123';
        process.env.EMAIL_FROM = '"Test" <test@example.com>';
    });

    afterEach(() => {
        // Restore original env
        process.env = { ...originalEnv };
    });

    describe('sendMail (via sendSRCreated)', () => {
        it('이메일 설정이 없으면 스킵하고 warn 로그를 남겨야 함', async () => {
            delete process.env.EMAIL_SERVER_USER;
            delete process.env.EMAIL_SERVER_PASSWORD;

            // Import fresh module
            vi.resetModules();
            const { emailService } = await import('../email.service');

            await emailService.sendSRCreated(
                'admin@test.com',
                'SR-001',
                'Test',
                'User',
                'http://link'
            );

            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Email credentials not found')
            );
            expect(mockSendMail).not.toHaveBeenCalled();
        });

        it('이메일 전송이 성공하면 info 로그를 남겨야 함', async () => {
            vi.resetModules();
            const { emailService } = await import('../email.service');

            await emailService.sendSRCreated(
                'admin@test.com',
                'SR-001',
                'Test Title',
                'Test User',
                'http://example.com/sr/1'
            );

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'admin@test.com',
                    subject: expect.stringContaining('SR-001'),
                })
            );
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Email sent')
            );
        });

        it('이메일 전송 실패 시 error 로그를 남겨야 함', async () => {
            mockSendMail.mockRejectedValueOnce(new Error('SMTP Error'));

            vi.resetModules();
            const { emailService } = await import('../email.service');

            await emailService.sendSRCreated(
                'admin@test.com',
                'SR-001',
                'Test',
                'User',
                'http://link'
            );

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error sending email'),
                expect.any(Error)
            );
        });
    });

    describe('sendSRAssigned', () => {
        it('담당자 배정 이메일을 전송해야 함', async () => {
            vi.resetModules();
            const { emailService } = await import('../email.service');

            await emailService.sendSRAssigned(
                'assignee@test.com',
                'SR-002',
                'Assigned SR',
                'Assignee Name',
                'http://example.com/sr/2'
            );

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'assignee@test.com',
                    subject: expect.stringContaining('담당자'),
                })
            );
        });
    });

    describe('sendSRStatusChanged', () => {
        it('상태 변경 이메일을 전송해야 함', async () => {
            vi.resetModules();
            const { emailService } = await import('../email.service');

            await emailService.sendSRStatusChanged(
                'user@test.com',
                'SR-003',
                'Status SR',
                'REQUESTED',
                'IN_PROGRESS',
                'http://example.com/sr/3'
            );

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    html: expect.stringContaining('요청됨'),
                })
            );
        });
    });

    describe('sendCommentAdded', () => {
        it('댓글 알림 이메일을 전송해야 함', async () => {
            vi.resetModules();
            const { emailService } = await import('../email.service');

            await emailService.sendCommentAdded(
                'user@test.com',
                'SR-004',
                'Comment SR',
                'Commenter',
                'This is a comment',
                'http://example.com/sr/4'
            );

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    html: expect.stringContaining('This is a comment'),
                })
            );
        });
    });
});
