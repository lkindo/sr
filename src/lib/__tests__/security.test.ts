import { compare } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import { verifyPassword } from '../security';

// Mock bcryptjs to inspect calls
vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
}));

describe('verifyPassword', () => {
  it('should use dummy hash with cost 12 when hash is null', async () => {
    // Call with null hash
    await verifyPassword('password', null);

    // Expect compare to be called with a hash that has cost 12 ($2a$12$ or $2b$12$)
    expect(compare).toHaveBeenCalledWith('password', expect.stringMatching(/^\$2[ab]\$12\$/));
  });

  it('should use dummy hash with cost 12 when hash is undefined', async () => {
    // Call with undefined hash
    await verifyPassword('password', undefined);

    // Expect compare to be called with a hash that has cost 12
    expect(compare).toHaveBeenCalledWith('password', expect.stringMatching(/^\$2[ab]\$12\$/));
  });

  it('should return false when hash is missing', async () => {
    // Mock compare to return false (which it would for dummy hash)
    vi.mocked(compare).mockResolvedValue(false);

    const result = await verifyPassword('password', null);
    expect(result).toBe(false);
  });

  it('should call compare with provided hash when it exists', async () => {
    const realHash = '$2a$12$somehash';
    await verifyPassword('password', realHash);

    expect(compare).toHaveBeenCalledWith('password', realHash);
  });
});
