import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock server-only module (used by push.service.ts)
vi.mock('server-only', () => ({}));

// Mock web-push module
vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue({ statusCode: 201, body: '' }),
}));

// 각 테스트 후 자동 cleanup
afterEach(() => {
  cleanup();
});

// Mock environment variables
process.env.VITEST = 'true';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.NEXTAUTH_SECRET = 'test-secret-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
