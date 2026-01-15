import { describe, it, expect, vi } from 'vitest';
import { backgroundTask, backgroundTasks } from '@/lib/wait-until';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('wait-until', () => {
    describe('backgroundTask', () => {
        it('should log success when promise resolves', async () => {
            const promise = Promise.resolve('success');
            await backgroundTask(promise, 'TestTask');

            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('TestTask completed successfully'));
        });

        it('should log error when promise rejects', async () => {
            const error = new Error('Test Error');
            const promise = Promise.reject(error);

            await backgroundTask(promise, 'TestTask');

            // Wait for handlers to run
            await promise.catch(() => { });
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('TestTask failed'),
                error
            );
        });
    });

    describe('backgroundTasks', () => {
        it('should handle multiple tasks', async () => {
            const p1 = Promise.resolve('p1');
            const p2 = Promise.resolve('p2');

            await backgroundTasks([
                { promise: p1, label: 'Task1' },
                { promise: p2, label: 'Task2' },
            ]);

            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Task1 completed successfully'));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Task2 completed successfully'));
        });
    });
});
