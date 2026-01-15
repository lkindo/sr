import { describe, it, expect } from 'vitest';
import { getDaysUntilDue, getDueDateStatus } from '@/lib/date-utils';

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
        it('should return completed status', () => {
            const status = getDueDateStatus('2023-01-01', 'COMPLETED');
            expect(status).toEqual({
                label: '완료됨',
                variant: 'default',
                isOverdue: false,
                isUrgent: false,
            });
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

        it('should return D-N status', () => {
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
});
