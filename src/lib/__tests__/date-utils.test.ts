import { describe, it, expect } from 'vitest';
import { getDaysUntilDue, getDueDateStatus, formatDate, formatDateTime } from '@/lib/date-utils';

describe('date-utils', () => {
    describe('getDaysUntilDue', () => {
        it('should return null if no due date is provided', () => {
            expect(getDaysUntilDue(null)).toBeNull();
            expect(getDaysUntilDue(undefined)).toBeNull();
        });

        it('should calculate accurate days remaining', () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);

            expect(getDaysUntilDue(tomorrow.toISOString())).toBe(1);
            expect(getDaysUntilDue(yesterday.toISOString())).toBe(-1);
            expect(getDaysUntilDue(today.toISOString())).toBe(0);
        });
    });

    describe('getDueDateStatus', () => {
        it('should return completed status for COMPLETED', () => {
            const status = getDueDateStatus('2023-01-01', 'COMPLETED');
            expect(status).toEqual({
                label: '완료됨',
                variant: 'default',
                isOverdue: false,
                isUrgent: false,
            });
        });

        it('should return completed status for CONFIRMED', () => {
            const status = getDueDateStatus('2023-01-01', 'CONFIRMED');
            expect(status).toEqual({
                label: '완료됨',
                variant: 'default',
                isOverdue: false,
                isUrgent: false,
            });
        });

        it('should return on hold status for ON_HOLD', () => {
            const status = getDueDateStatus('2023-01-01', 'ON_HOLD');
            expect(status).toEqual({
                label: '보류중',
                variant: 'secondary',
                isOverdue: false,
                isUrgent: false,
            });
        });

        it('should return rejected status for REJECTED', () => {
            const status = getDueDateStatus('2023-01-01', 'REJECTED');
            expect(status).toEqual({
                label: '거절됨',
                variant: 'destructive',
                isOverdue: false,
                isUrgent: false,
            });
        });

        it('should return null if no due date', () => {
            const status = getDueDateStatus(null, 'IN_PROGRESS');
            expect(status).toBeNull();
        });

        it('should return overdue status', () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 5);

            const status = getDueDateStatus(pastDate.toISOString(), 'IN_PROGRESS');
            expect(status).toEqual({
                label: '5일 지연',
                variant: 'destructive',
                isOverdue: true,
                isUrgent: false,
            });
        });

        it('should return urgent status for D-Day', () => {
            const today = new Date();
            const status = getDueDateStatus(today.toISOString(), 'IN_PROGRESS');
            expect(status).toEqual({
                label: '오늘 마감',
                variant: 'destructive',
                isOverdue: false,
                isUrgent: true,
            });
        });

        it('should return urgent status for D-1', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const status = getDueDateStatus(tomorrow.toISOString(), 'IN_PROGRESS');
            expect(status).toEqual({
                label: '내일 마감',
                variant: 'destructive',
                isOverdue: false,
                isUrgent: true,
            });
        });

        it('should return D-2 as urgent', () => {
            const d2 = new Date();
            d2.setDate(d2.getDate() + 2);
            const status = getDueDateStatus(d2.toISOString(), 'IN_PROGRESS');
            expect(status).toEqual({
                label: 'D-2',
                variant: 'destructive',
                isOverdue: false,
                isUrgent: true,
            });
        });

        it('should return D-3 as urgent', () => {
            const d3 = new Date();
            d3.setDate(d3.getDate() + 3);
            const status = getDueDateStatus(d3.toISOString(), 'IN_PROGRESS');
            expect(status).toEqual({
                label: 'D-3',
                variant: 'destructive',
                isOverdue: false,
                isUrgent: true,
            });
        });

        it('should return D-5 as secondary (not urgent)', () => {
            const d5 = new Date();
            d5.setDate(d5.getDate() + 5);
            const status = getDueDateStatus(d5.toISOString(), 'IN_PROGRESS');
            expect(status).toEqual({
                label: 'D-5',
                variant: 'secondary',
                isOverdue: false,
                isUrgent: false,
            });
        });

        it('should return D-7 as secondary', () => {
            const d7 = new Date();
            d7.setDate(d7.getDate() + 7);
            const status = getDueDateStatus(d7.toISOString(), 'IN_PROGRESS');
            expect(status).toEqual({
                label: 'D-7',
                variant: 'secondary',
                isOverdue: false,
                isUrgent: false,
            });
        });

        it('should return D-N status for far future', () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 10);

            const status = getDueDateStatus(futureDate.toISOString(), 'IN_PROGRESS');
            expect(status).toEqual({
                label: 'D-10',
                variant: 'default',
                isOverdue: false,
                isUrgent: false,
            });
        });
    });

    describe('formatDate', () => {
        it('should format date string in Korean format', () => {
            const result = formatDate('2024-01-15');
            expect(result).toContain('2024');
            expect(result).toContain('1');
            expect(result).toContain('15');
        });

        it('should format Date object', () => {
            const result = formatDate(new Date('2024-06-20'));
            expect(result).toContain('2024');
            expect(result).toContain('6');
            expect(result).toContain('20');
        });
    });

    describe('formatDateTime', () => {
        it('should format date time string in Korean format', () => {
            const result = formatDateTime('2024-01-15T14:30:00');
            expect(result).toContain('2024');
            expect(result).toContain('1');
            expect(result).toContain('15');
        });

        it('should format Date object with time', () => {
            const date = new Date('2024-06-20T10:45:00');
            const result = formatDateTime(date);
            expect(result).toContain('2024');
        });
    });
});

