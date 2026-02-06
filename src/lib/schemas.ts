import { z } from 'zod';

const emptyStringToUndefined = (val: unknown) => (val === '' ? undefined : val);
const emptyStringToNull = (val: unknown) => (val === '' ? null : val);
const emptyStringAndNullToUndefined = (val: unknown) =>
  val === '' || val === null ? undefined : val;

/**
 * 비밀번호 복잡도 검증 스키마
 *
 * 보안 요구사항:
 * - 최소 8자 이상
 * - 대문자 1개 이상 포함 (A-Z)
 * - 소문자 1개 이상 포함 (a-z)
 * - 숫자 1개 이상 포함 (0-9)
 * - 특수문자 1개 이상 포함 (!@#$%^&*()_+-=[]{}|;:,.<>?)
 */
export const passwordSchema = z
  .string()
  .min(8, '비밀번호는 최소 8자 이상이어야 합니다.')
  .max(100, '비밀번호는 100자를 초과할 수 없습니다.')
  .regex(/[A-Z]/, '비밀번호는 대문자를 최소 1개 이상 포함해야 합니다.')
  .regex(/[a-z]/, '비밀번호는 소문자를 최소 1개 이상 포함해야 합니다.')
  .regex(/[0-9]/, '비밀번호는 숫자를 최소 1개 이상 포함해야 합니다.')
  .regex(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/, '비밀번호는 특수문자를 최소 1개 이상 포함해야 합니다.');

/**
 * 회원가입 스키마
 */
export const registerSchema = z
  .object({
    name: z.string().min(1, '이름을 입력해주세요.').max(100, '이름은 100자를 초과할 수 없습니다.'),
    email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '비밀번호가 일치하지 않습니다.',
    path: ['confirmPassword'],
  });

/**
 * 로그인 스키마
 */
export const loginSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: z.string().min(1, '비밀번호를 입력해주세요.'),
});

/**
 * 비밀번호 변경 스키마
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력해주세요.'),
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: '새 비밀번호가 일치하지 않습니다.',
    path: ['confirmNewPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: '새 비밀번호는 현재 비밀번호와 달라야 합니다.',
    path: ['newPassword'],
  });

// Client Schemas
export const clientCreateSchema = z.object({
  code: z.string().min(2, '고객사 코드는 최소 2자 이상이어야 합니다.'),
  name: z.string().min(1, '고객사 이름을 입력해주세요.'),
  industry: z.preprocess(emptyStringToUndefined, z.string().optional()),
  contactPerson: z.preprocess(emptyStringToUndefined, z.string().optional()),
  contactEmail: z.preprocess(
    emptyStringToUndefined,
    z.string().email('유효한 이메일 주소를 입력해주세요.').optional()
  ),
  contactPhone: z.preprocess(emptyStringToUndefined, z.string().optional()),
  address: z.preprocess(emptyStringToUndefined, z.string().optional()),
  contractStartDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
  contractEndDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
});

export const clientUpdateSchema = clientCreateSchema.omit({ code: true }).partial();

// SR Schemas
export const srCreateSchema = z.object({
  title: z.string().min(5, '제목은 최소 5자 이상이어야 합니다.'),
  description: z.string().min(10, '설명은 최소 10자 이상이어야 합니다.'),
  clientId: z.string().min(1, '고객사를 선택해주세요.'),
  serviceCategoryId: z.string().min(1, '서비스 카테고리를 선택해주세요.'),
  requestedPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  requestedCompletionDate: z.string().optional(),
});

export const srUpdateSchema = z.object({
  title: z.preprocess(
    emptyStringToUndefined,
    z.string().min(5, '제목은 최소 5자 이상이어야 합니다.').optional()
  ),
  description: z.preprocess(
    emptyStringToUndefined,
    z.string().min(10, '설명은 최소 10자 이상이어야 합니다.').optional()
  ),
  clientId: z.preprocess(emptyStringToUndefined, z.string().optional()),
  serviceCategoryId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  priority: z.preprocess(
    emptyStringToUndefined,
    z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional()
  ),
  status: z.preprocess(
    emptyStringToUndefined,
    z
      .enum(['REQUESTED', 'INTAKE', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CONFIRMED', 'REJECTED'])
      .optional()
  ),
  assignedToId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  expectedCompletionDate: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  dueDate: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  actualCompletionDate: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  resolutionDescription: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  rejectionReason: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  satisfactionRating: z.preprocess(
    (val) => (val === '' ? null : typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().min(1).max(5).optional().nullable()
  ),
  additionalFeedback: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  actualPriority: z.preprocess(
    emptyStringToUndefined,
    z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional()
  ),
  estimatedHours: z.preprocess(
    (val) => (val === '' ? null : typeof val === 'string' ? parseFloat(val) : val),
    z.number().positive('예상 작업 시간은 0보다 커야 합니다').optional().nullable()
  ),
  estimatedCompletionDate: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  intakeNotes: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  assigneeId: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1, '담당자를 선택해주세요').optional()
  ),
  changeReason: z.preprocess(emptyStringToUndefined, z.string().optional()),
});

// User Schemas
export const userUpdateSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요.').optional(),
  email: z.string().email('유효한 이메일 주소를 입력해주세요.').optional(),
  image: z.string().url('유효한 이미지 URL을 입력해주세요.').optional(),
  isActive: z.boolean().optional(),
  clientIds: z.array(z.string()).optional(),
});

// Role Schemas
export const roleCreateSchema = z.object({
  name: z.string().min(1, '역할 이름을 입력해주세요.'),
  description: z.string().optional(),
});

export const roleUpdateSchema = roleCreateSchema.partial();

// SR Intake Schema - 접수 처리 전용
export const intakeSchema = z.object({
  actualPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  estimatedHours: z.number().positive('예상 작업 시간은 0보다 커야 합니다'),
  estimatedCompletionDate: z.string(),
  intakeNotes: z.string().optional(),
  assigneeId: z.string().min(1, '담당자를 선택해주세요'),
});

// SR Intake Update Schema - 접수 정보 수정 전용
export const intakeUpdateSchema = z.object({
  actualPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  estimatedHours: z
    .number()
    .positive('예상 작업 시간은 0보다 커야 합니다')
    .max(1000, '예상 작업 시간은 1000시간을 초과할 수 없습니다')
    .optional(),
  estimatedCompletionDate: z.string().optional(),
  intakeNotes: z.string().optional().nullable(),
  assigneeId: z.string().min(1, '담당자를 선택해주세요').optional(),
});

// ServiceCategory Schemas
export const serviceCategoryCreateSchema = z.object({
  categoryName: z.string().min(1, '카테고리 이름을 입력해주세요.'),
  description: z.preprocess(emptyStringToUndefined, z.string().optional()),
  slaHours: z.number().int().positive('SLA 시간은 0보다 커야 합니다.'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  clientId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  handlerId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  backupHandlerId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
});

export const serviceCategoryUpdateSchema = serviceCategoryCreateSchema.partial();
