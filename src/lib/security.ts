import { compare } from 'bcryptjs';

/**
 * A dummy hash used for constant-time comparison when a user is not found.
 * This hash has a cost of 10, matching the application's default.
 * Generated using bcryptjs with cost 10 and salt.
 */
const DUMMY_HASH = '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxw96pPrkSL/Cs5qSpG2245.w4r5q';

/**
 * Verifies a password against a hash, or performs a dummy comparison if the hash is missing.
 * This prevents timing attacks where an attacker could determine if a user exists
 * based on the response time.
 *
 * @param password The password to verify
 * @param hash The stored hash (can be null/undefined if user not found)
 * @returns true if password matches hash, false otherwise
 */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) {
    // Perform dummy comparison to simulate work
    await compare(password, DUMMY_HASH);
    return false;
  }
  return compare(password, hash);
}
