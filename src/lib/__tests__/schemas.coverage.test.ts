import { describe, expect, it } from 'vitest';

import {
  changePasswordSchema,
  clientCreateSchema,
  clientUpdateSchema,
  intakeSchema,
  intakeUpdateSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  roleCreateSchema,
  roleUpdateSchema,
  serviceCategoryCreateSchema,
  serviceCategoryUpdateSchema,
  srCreateSchema,
  srUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from '@/lib/schemas';

describe('passwordSchema', () => {
  it('accepts a strong password', () => {
    const r = passwordSchema.safeParse('Abcdef1!');
    expect(r.success).toBe(true);
  });

  it('rejects when too short (< 8)', () => {
    const r = passwordSchema.safeParse('Ab1!');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('최소 8자'))).toBe(true);
    }
  });

  it('rejects when too long (> 100)', () => {
    const long = 'A1!' + 'a'.repeat(100);
    const r = passwordSchema.safeParse(long);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('100자'))).toBe(true);
    }
  });

  it('rejects missing uppercase', () => {
    const r = passwordSchema.safeParse('abcdef1!');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('대문자'))).toBe(true);
    }
  });

  it('rejects missing lowercase', () => {
    const r = passwordSchema.safeParse('ABCDEF1!');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('소문자'))).toBe(true);
    }
  });

  it('rejects missing digit', () => {
    const r = passwordSchema.safeParse('Abcdefg!');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('숫자'))).toBe(true);
    }
  });

  it('rejects missing special character', () => {
    const r = passwordSchema.safeParse('Abcdefg1');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes('특수문자'))).toBe(true);
    }
  });

  it('rejects a non-string input', () => {
    const r = passwordSchema.safeParse(12345678);
    expect(r.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const base = {
    name: 'Alice',
    email: 'alice@example.com',
    password: 'Abcdef1!',
    confirmPassword: 'Abcdef1!',
  };

  it('accepts valid input with matching passwords', () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it('rejects mismatched passwords (refine)', () => {
    const r = registerSchema.safeParse({ ...base, confirmPassword: 'Abcdef2!' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('confirmPassword'))).toBe(true);
    }
  });

  it('rejects empty name', () => {
    expect(registerSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('rejects name over 100 chars', () => {
    expect(registerSchema.safeParse({ ...base, name: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(registerSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects weak password', () => {
    expect(
      registerSchema.safeParse({ ...base, password: 'weak', confirmPassword: 'weak' }).success
    ).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(loginSchema.safeParse({ email: 'bad', password: 'x' }).success).toBe(false);
  });

  it('rejects empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const base = {
    currentPassword: 'Old1234!',
    newPassword: 'New1234!',
    confirmNewPassword: 'New1234!',
  };

  it('accepts valid change', () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it('rejects empty current password', () => {
    expect(changePasswordSchema.safeParse({ ...base, currentPassword: '' }).success).toBe(false);
  });

  it('rejects mismatched new passwords (first refine)', () => {
    const r = changePasswordSchema.safeParse({ ...base, confirmNewPassword: 'Other123!' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('confirmNewPassword'))).toBe(true);
    }
  });

  it('rejects new password equal to current (second refine)', () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: 'Same1234!',
      newPassword: 'Same1234!',
      confirmNewPassword: 'Same1234!',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('newPassword'))).toBe(true);
    }
  });

  it('rejects weak new password', () => {
    expect(
      changePasswordSchema.safeParse({
        ...base,
        newPassword: 'weak',
        confirmNewPassword: 'weak',
      }).success
    ).toBe(false);
  });
});

describe('clientCreateSchema', () => {
  it('accepts minimal valid input and turns empty strings into undefined', () => {
    const r = clientCreateSchema.safeParse({
      code: 'AB',
      name: 'Acme',
      industry: '',
      contactPerson: '',
      contactEmail: '',
      contactPhone: '',
      address: '',
      contractStartDate: '',
      contractEndDate: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.industry).toBeUndefined();
      expect(r.data.contactPerson).toBeUndefined();
      expect(r.data.contactEmail).toBeUndefined();
      expect(r.data.contactPhone).toBeUndefined();
      expect(r.data.address).toBeUndefined();
      expect(r.data.contractStartDate).toBeUndefined();
      expect(r.data.contractEndDate).toBeUndefined();
    }
  });

  it('accepts populated optional fields', () => {
    const r = clientCreateSchema.safeParse({
      code: 'AB',
      name: 'Acme',
      industry: 'Tech',
      contactPerson: 'Bob',
      contactEmail: 'bob@acme.com',
      contactPhone: '010',
      address: 'Seoul',
      contractStartDate: '2026-01-01',
      contractEndDate: '2026-12-31',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.industry).toBe('Tech');
      expect(r.data.contactEmail).toBe('bob@acme.com');
    }
  });

  it('rejects code shorter than 2 chars', () => {
    expect(clientCreateSchema.safeParse({ code: 'A', name: 'Acme' }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(clientCreateSchema.safeParse({ code: 'AB', name: '' }).success).toBe(false);
  });

  it('rejects invalid non-empty contactEmail (preprocess keeps value)', () => {
    const r = clientCreateSchema.safeParse({
      code: 'AB',
      name: 'Acme',
      contactEmail: 'bad-email',
    });
    expect(r.success).toBe(false);
  });
});

describe('clientUpdateSchema', () => {
  it('accepts empty object (all partial, no code)', () => {
    expect(clientUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('does not accept code field shape but ignores extras gracefully', () => {
    const r = clientUpdateSchema.safeParse({ name: 'New', industry: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.industry).toBeUndefined();
    }
  });
});

describe('srCreateSchema', () => {
  const base = {
    title: 'A valid title',
    description: 'A sufficiently long description',
    clientId: 'c1',
    serviceCategoryId: 'sc1',
    requestedPriority: 'HIGH' as const,
  };

  it('accepts valid input', () => {
    expect(srCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepts optional requestedCompletionDate', () => {
    expect(
      srCreateSchema.safeParse({ ...base, requestedCompletionDate: '2026-01-01' }).success
    ).toBe(true);
  });

  it('rejects short title (< 5)', () => {
    expect(srCreateSchema.safeParse({ ...base, title: 'abc' }).success).toBe(false);
  });

  it('rejects short description (< 10)', () => {
    expect(srCreateSchema.safeParse({ ...base, description: 'short' }).success).toBe(false);
  });

  it('rejects empty clientId', () => {
    expect(srCreateSchema.safeParse({ ...base, clientId: '' }).success).toBe(false);
  });

  it('rejects empty serviceCategoryId', () => {
    expect(srCreateSchema.safeParse({ ...base, serviceCategoryId: '' }).success).toBe(false);
  });

  it('rejects invalid priority enum', () => {
    expect(srCreateSchema.safeParse({ ...base, requestedPriority: 'URGENT' }).success).toBe(false);
  });
});

describe('srUpdateSchema', () => {
  it('accepts empty object (everything optional)', () => {
    const r = srUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('converts empty-string title/description/clientId to undefined', () => {
    const r = srUpdateSchema.safeParse({ title: '', description: '', clientId: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBeUndefined();
      expect(r.data.description).toBeUndefined();
      expect(r.data.clientId).toBeUndefined();
    }
  });

  it('rejects too-short title when provided non-empty', () => {
    expect(srUpdateSchema.safeParse({ title: 'abc' }).success).toBe(false);
  });

  it('rejects too-short description when provided non-empty', () => {
    expect(srUpdateSchema.safeParse({ description: 'short' }).success).toBe(false);
  });

  it('accepts valid title/description', () => {
    const r = srUpdateSchema.safeParse({
      title: 'Valid title here',
      description: 'A long enough description',
    });
    expect(r.success).toBe(true);
  });

  it('converts empty-string nullable fields to null', () => {
    const r = srUpdateSchema.safeParse({
      serviceCategoryId: '',
      assignedToId: '',
      expectedCompletionDate: '',
      dueDate: '',
      actualCompletionDate: '',
      resolutionDescription: '',
      rejectionReason: '',
      additionalFeedback: '',
      estimatedCompletionDate: '',
      intakeNotes: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.serviceCategoryId).toBeNull();
      expect(r.data.assignedToId).toBeNull();
      expect(r.data.expectedCompletionDate).toBeNull();
      expect(r.data.dueDate).toBeNull();
      expect(r.data.actualCompletionDate).toBeNull();
      expect(r.data.resolutionDescription).toBeNull();
      expect(r.data.rejectionReason).toBeNull();
      expect(r.data.additionalFeedback).toBeNull();
      expect(r.data.estimatedCompletionDate).toBeNull();
      expect(r.data.intakeNotes).toBeNull();
    }
  });

  it('accepts explicit null for nullable fields', () => {
    const r = srUpdateSchema.safeParse({ assignedToId: null, serviceCategoryId: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.assignedToId).toBeNull();
      expect(r.data.serviceCategoryId).toBeNull();
    }
  });

  it('converts empty-string priority/status/actualPriority to undefined', () => {
    const r = srUpdateSchema.safeParse({ priority: '', status: '', actualPriority: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBeUndefined();
      expect(r.data.status).toBeUndefined();
      expect(r.data.actualPriority).toBeUndefined();
    }
  });

  it('accepts valid enums for priority/status/actualPriority', () => {
    const r = srUpdateSchema.safeParse({
      priority: 'LOW',
      status: 'IN_PROGRESS',
      actualPriority: 'CRITICAL',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBe('LOW');
      expect(r.data.status).toBe('IN_PROGRESS');
      expect(r.data.actualPriority).toBe('CRITICAL');
    }
  });

  it('rejects invalid status enum', () => {
    expect(srUpdateSchema.safeParse({ status: 'NOPE' }).success).toBe(false);
  });

  describe('satisfactionRating preprocess', () => {
    it('empty string -> null', () => {
      const r = srUpdateSchema.safeParse({ satisfactionRating: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.satisfactionRating).toBeNull();
    });

    it('numeric string -> parsed int', () => {
      const r = srUpdateSchema.safeParse({ satisfactionRating: '4' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.satisfactionRating).toBe(4);
    });

    it('passes through a number', () => {
      const r = srUpdateSchema.safeParse({ satisfactionRating: 3 });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.satisfactionRating).toBe(3);
    });

    it('accepts null', () => {
      const r = srUpdateSchema.safeParse({ satisfactionRating: null });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.satisfactionRating).toBeNull();
    });

    it('rejects below min (1)', () => {
      expect(srUpdateSchema.safeParse({ satisfactionRating: '0' }).success).toBe(false);
    });

    it('rejects above max (5)', () => {
      expect(srUpdateSchema.safeParse({ satisfactionRating: 6 }).success).toBe(false);
    });
  });

  describe('estimatedHours preprocess', () => {
    it('empty string -> null', () => {
      const r = srUpdateSchema.safeParse({ estimatedHours: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.estimatedHours).toBeNull();
    });

    it('numeric string -> parsed float', () => {
      const r = srUpdateSchema.safeParse({ estimatedHours: '2.5' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.estimatedHours).toBe(2.5);
    });

    it('passes through a number', () => {
      const r = srUpdateSchema.safeParse({ estimatedHours: 10 });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.estimatedHours).toBe(10);
    });

    it('accepts null', () => {
      const r = srUpdateSchema.safeParse({ estimatedHours: null });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.estimatedHours).toBeNull();
    });

    it('rejects non-positive value', () => {
      expect(srUpdateSchema.safeParse({ estimatedHours: '0' }).success).toBe(false);
      expect(srUpdateSchema.safeParse({ estimatedHours: -3 }).success).toBe(false);
    });
  });

  describe('assigneeId / changeReason preprocess', () => {
    it('empty assigneeId -> undefined', () => {
      const r = srUpdateSchema.safeParse({ assigneeId: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.assigneeId).toBeUndefined();
    });

    it('accepts a non-empty assigneeId', () => {
      const r = srUpdateSchema.safeParse({ assigneeId: 'u1' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.assigneeId).toBe('u1');
    });

    it('empty changeReason -> undefined', () => {
      const r = srUpdateSchema.safeParse({ changeReason: '' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.changeReason).toBeUndefined();
    });
  });
});

describe('userCreateSchema', () => {
  const base = {
    name: 'Alice',
    email: 'alice@example.com',
    password: 'Abcdef1!',
  };

  it('accepts minimal valid input', () => {
    expect(userCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepts full optional fields', () => {
    const r = userCreateSchema.safeParse({
      ...base,
      userType: 'ENGINEER',
      clientId: 'c1',
      clientIds: ['c1', 'c2'],
      roleIds: ['r1'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid userType enum', () => {
    expect(userCreateSchema.safeParse({ ...base, userType: 'ADMIN' }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(userCreateSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(userCreateSchema.safeParse({ ...base, email: 'nope' }).success).toBe(false);
  });

  it('rejects weak password', () => {
    expect(userCreateSchema.safeParse({ ...base, password: 'weak' }).success).toBe(false);
  });

  it('rejects non-array clientIds', () => {
    expect(userCreateSchema.safeParse({ ...base, clientIds: 'c1' }).success).toBe(false);
  });
});

describe('userUpdateSchema', () => {
  it('accepts empty object', () => {
    expect(userUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts all valid optional fields', () => {
    const r = userUpdateSchema.safeParse({
      name: 'New',
      email: 'new@example.com',
      image: 'https://example.com/a.png',
      isActive: true,
      clientIds: ['c1'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty name when provided', () => {
    expect(userUpdateSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(userUpdateSchema.safeParse({ email: 'bad' }).success).toBe(false);
  });

  it('rejects invalid image url', () => {
    expect(userUpdateSchema.safeParse({ image: 'not-a-url' }).success).toBe(false);
  });

  it('rejects non-boolean isActive', () => {
    expect(userUpdateSchema.safeParse({ isActive: 'yes' }).success).toBe(false);
  });
});

describe('roleCreateSchema / roleUpdateSchema', () => {
  it('create accepts valid', () => {
    expect(roleCreateSchema.safeParse({ name: 'Admin' }).success).toBe(true);
  });

  it('create accepts optional description', () => {
    expect(roleCreateSchema.safeParse({ name: 'Admin', description: 'desc' }).success).toBe(true);
  });

  it('create rejects empty name', () => {
    expect(roleCreateSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('update (partial) accepts empty object', () => {
    expect(roleUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('update accepts only description', () => {
    expect(roleUpdateSchema.safeParse({ description: 'x' }).success).toBe(true);
  });
});

describe('intakeSchema', () => {
  const base = {
    actualPriority: 'HIGH' as const,
    estimatedHours: 5,
    estimatedCompletionDate: '2026-01-01',
    assigneeId: 'u1',
  };

  it('accepts valid input', () => {
    expect(intakeSchema.safeParse(base).success).toBe(true);
  });

  it('accepts optional intakeNotes', () => {
    expect(intakeSchema.safeParse({ ...base, intakeNotes: 'notes' }).success).toBe(true);
  });

  it('rejects invalid priority', () => {
    expect(intakeSchema.safeParse({ ...base, actualPriority: 'X' }).success).toBe(false);
  });

  it('rejects non-positive estimatedHours', () => {
    expect(intakeSchema.safeParse({ ...base, estimatedHours: 0 }).success).toBe(false);
  });

  it('rejects empty assigneeId', () => {
    expect(intakeSchema.safeParse({ ...base, assigneeId: '' }).success).toBe(false);
  });

  it('rejects missing estimatedCompletionDate', () => {
    const { estimatedCompletionDate, ...rest } = base;
    void estimatedCompletionDate;
    expect(intakeSchema.safeParse(rest).success).toBe(false);
  });
});

describe('intakeUpdateSchema', () => {
  it('accepts empty object', () => {
    expect(intakeUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts full valid input', () => {
    const r = intakeUpdateSchema.safeParse({
      actualPriority: 'LOW',
      estimatedHours: 100,
      estimatedCompletionDate: '2026-01-01',
      intakeNotes: 'notes',
      assigneeId: 'u1',
    });
    expect(r.success).toBe(true);
  });

  it('accepts null intakeNotes', () => {
    expect(intakeUpdateSchema.safeParse({ intakeNotes: null }).success).toBe(true);
  });

  it('rejects estimatedHours over 1000', () => {
    expect(intakeUpdateSchema.safeParse({ estimatedHours: 1001 }).success).toBe(false);
  });

  it('rejects non-positive estimatedHours', () => {
    expect(intakeUpdateSchema.safeParse({ estimatedHours: -1 }).success).toBe(false);
  });

  it('rejects empty assigneeId when provided', () => {
    expect(intakeUpdateSchema.safeParse({ assigneeId: '' }).success).toBe(false);
  });
});

describe('serviceCategoryCreateSchema', () => {
  const base = {
    categoryName: 'Network',
    slaHours: 24,
  };

  it('accepts minimal valid input and applies default priority MEDIUM', () => {
    const r = serviceCategoryCreateSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priority).toBe('MEDIUM');
    }
  });

  it('converts empty-string description to undefined', () => {
    const r = serviceCategoryCreateSchema.safeParse({ ...base, description: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeUndefined();
  });

  it('converts empty-string nullable ids to null', () => {
    const r = serviceCategoryCreateSchema.safeParse({
      ...base,
      clientId: '',
      handlerId: '',
      backupHandlerId: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.clientId).toBeNull();
      expect(r.data.handlerId).toBeNull();
      expect(r.data.backupHandlerId).toBeNull();
    }
  });

  it('accepts explicit priority override', () => {
    const r = serviceCategoryCreateSchema.safeParse({ ...base, priority: 'CRITICAL' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.priority).toBe('CRITICAL');
  });

  it('rejects empty categoryName', () => {
    expect(serviceCategoryCreateSchema.safeParse({ ...base, categoryName: '' }).success).toBe(
      false
    );
  });

  it('rejects non-integer slaHours', () => {
    expect(serviceCategoryCreateSchema.safeParse({ ...base, slaHours: 1.5 }).success).toBe(false);
  });

  it('rejects non-positive slaHours', () => {
    expect(serviceCategoryCreateSchema.safeParse({ ...base, slaHours: 0 }).success).toBe(false);
  });
});

describe('serviceCategoryUpdateSchema', () => {
  it('accepts empty object (partial)', () => {
    expect(serviceCategoryUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts partial with empty-string description -> undefined', () => {
    const r = serviceCategoryUpdateSchema.safeParse({ description: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.description).toBeUndefined();
  });

  it('still validates provided slaHours', () => {
    expect(serviceCategoryUpdateSchema.safeParse({ slaHours: -5 }).success).toBe(false);
  });
});
