import { describe, expect, it } from 'vitest';
import { changePasswordSchema, passwordSchema } from '../schemas';

describe('Schema Validation', () => {
  describe('passwordSchema', () => {
    it('should reject weak passwords', () => {
      expect(passwordSchema.safeParse('weak').success).toBe(false);
      expect(passwordSchema.safeParse('no_uppercase_1!').success).toBe(false);
      expect(passwordSchema.safeParse('NO_LOWERCASE_1!').success).toBe(false);
      expect(passwordSchema.safeParse('No_Number_!').success).toBe(false);
      expect(passwordSchema.safeParse('NoSpecialChar1').success).toBe(false);
    });

    it('should accept strong passwords', () => {
      expect(passwordSchema.safeParse('StrongP@ssw0rd').success).toBe(true);
    });
  });

  describe('changePasswordSchema', () => {
    it('should fail when passwords do not match', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldPassword',
        newPassword: 'StrongP@ssw0rd',
        confirmPassword: 'DifferentPassword',
      });
      expect(result.success).toBe(false);
    });

    it('should pass when passwords match', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'oldPassword',
        newPassword: 'StrongP@ssw0rd',
        confirmPassword: 'StrongP@ssw0rd',
      });
      expect(result.success).toBe(true);
    });
  });
});
