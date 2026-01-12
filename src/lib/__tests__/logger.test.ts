import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@/lib/logger';

describe('Logger Utility', () => {

    let consoleErrorSpy: any;
    let consoleWarnSpy: any;
    let consoleInfoSpy: any;

    beforeEach(() => {

        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => { });

        // Reset environment variables for each test
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should log info messages', () => {
        logger.info('Test info message');
        // In development (default for tests), info logs are printed via console.info
        expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('should log error messages', () => {
        const error = new Error('Test error');
        logger.error('Test error message', error);
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log warn messages', () => {
        logger.warn('Test warn message');
        expect(consoleWarnSpy).toHaveBeenCalled();
    });
});
