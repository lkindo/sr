import { z } from 'zod';

const emptyStringToUndefined = (val: unknown) => (val === '' ? undefined : val);
const emptyStringToNull = (val: unknown) => (val === '' ? null : val);

/**
 * 문자열 필드 길이 상한 (감사 4.3).
 *
 * 대부분의 텍스트 필드에 `min` 만 있고 `max` 가 없어, 인증된 단일 POST 로 거대한 텍스트를
 * Postgres 에 영속시킬 수 있었다.
 *
 * **값은 `prisma/schema.prisma` 의 컬럼 폭에서 도출한다.** zod 상한이 컬럼보다 크면
 * 검증은 통과하고 DB 가 거부해, 사용자에게는 원인을 알 수 없는 500 으로 보인다.
 * (실제로 `registerSchema.name` / `userCreateSchema.name` 이 `.max(100)` 인데
 *  `users.name` 은 varchar(50) 이라 51~100자 이름이 정확히 그 경로를 밟고 있었다.)
 *
 * 컬럼이 무제한 TEXT 인 필드(description, 코멘트, 메모 등)는 DB 제약이 없으므로
 * 여기서 정하는 값이 유일한 상한이다.
 */
export const FIELD_LIMITS = {
  // varchar(50) — users.name, roles.name, clients.contactPerson
  NAME: 50,
  // varchar(100) — clients.name, clients.industry, service_categories.categoryName
  DISPLAY_NAME: 100,
  // varchar(50) — clients.code, permissions.resource/action
  CODE: 50,
  // varchar(255) — users.email, clients.contactEmail
  EMAIL: 255,
  // varchar(30) — clients.contactPhone
  PHONE: 30,
  // varchar(500) — clients.address
  ADDRESS: 500,
  // varchar(255) — roles.description, service_categories.description
  SHORT_TEXT: 255,
  // varchar(255) — srs.title (여유를 두고 200)
  TITLE: 200,
  // varchar(1024) — users.image
  URL: 1024,
  // TEXT (DB 무제한) — srs.description
  LONG_TEXT: 10_000,
  // TEXT (DB 무제한) — sr_comments.content, intake_notes, resolution/rejection 등
  NOTE: 5_000,
} as const;

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
    name: z
      .string()
      .min(1, '이름을 입력해주세요.')
      .max(FIELD_LIMITS.NAME, `이름은 ${FIELD_LIMITS.NAME}자를 초과할 수 없습니다.`),
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
  code: z
    .string()
    .min(2, '고객사 코드는 최소 2자 이상이어야 합니다.')
    .max(FIELD_LIMITS.CODE, `고객사 코드는 ${FIELD_LIMITS.CODE}자를 초과할 수 없습니다.`),
  name: z
    .string()
    .min(1, '고객사 이름을 입력해주세요.')
    .max(
      FIELD_LIMITS.DISPLAY_NAME,
      `고객사 이름은 ${FIELD_LIMITS.DISPLAY_NAME}자를 초과할 수 없습니다.`
    ),
  industry: z.preprocess(
    emptyStringToUndefined,
    z.string().max(FIELD_LIMITS.DISPLAY_NAME).optional()
  ),
  contactPerson: z.preprocess(emptyStringToUndefined, z.string().max(FIELD_LIMITS.NAME).optional()),
  contactEmail: z.preprocess(
    emptyStringToUndefined,
    z.string().email('유효한 이메일 주소를 입력해주세요.').max(FIELD_LIMITS.EMAIL).optional()
  ),
  contactPhone: z.preprocess(emptyStringToUndefined, z.string().max(FIELD_LIMITS.PHONE).optional()),
  address: z.preprocess(emptyStringToUndefined, z.string().max(FIELD_LIMITS.ADDRESS).optional()),
  /**
   * 활성 여부.
   *
   * 이 필드가 없던 동안 고객사 비활성화가 **동작하지 않았다.** ClientDialog 는
   * `formData.append('isActive', ...)` 로 값을 보냈지만 clientUpdateSchema 가
   * `clientCreateSchema.omit({ code }).partial()` 이라 여기 없는 키는 zod 가 조용히
   * 제거했다. REST 는 200 을 주면서 아무 일도 하지 않았고, 하드 삭제는 기본 서비스
   * 분류 때문에 409 라, 고객사를 정리할 방법이 아예 없었다.
   */
  isActive: z.boolean().optional(),
  contractStartDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
  contractEndDate: z.preprocess(emptyStringToUndefined, z.string().optional()),
});

export const clientUpdateSchema = clientCreateSchema.omit({ code: true }).partial();

// SR Schemas
export const srCreateSchema = z.object({
  title: z
    .string()
    .min(5, '제목은 최소 5자 이상이어야 합니다.')
    .max(FIELD_LIMITS.TITLE, `제목은 ${FIELD_LIMITS.TITLE}자를 초과할 수 없습니다.`),
  description: z
    .string()
    .min(10, '설명은 최소 10자 이상이어야 합니다.')
    .max(FIELD_LIMITS.LONG_TEXT, `설명은 ${FIELD_LIMITS.LONG_TEXT}자를 초과할 수 없습니다.`),
  clientId: z.string().min(1, '고객사를 선택해주세요.'),
  serviceCategoryId: z.string().min(1, '서비스 카테고리를 선택해주세요.'),
  requestedPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  requestedCompletionDate: z.string().optional(),
});

export const srUpdateSchema = z.object({
  title: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .min(5, '제목은 최소 5자 이상이어야 합니다.')
      .max(FIELD_LIMITS.TITLE, `제목은 ${FIELD_LIMITS.TITLE}자를 초과할 수 없습니다.`)
      .optional()
  ),
  description: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .min(10, '설명은 최소 10자 이상이어야 합니다.')
      .max(FIELD_LIMITS.LONG_TEXT, `설명은 ${FIELD_LIMITS.LONG_TEXT}자를 초과할 수 없습니다.`)
      .optional()
  ),
  clientId: z.preprocess(emptyStringToUndefined, z.string().optional()),
  serviceCategoryId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  priority: z.preprocess(
    emptyStringToUndefined,
    z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional()
  ),
  /**
   * 요청자가 표명하는 희망 긴급도·기한 (감사 3.27).
   *
   * EditSRDialog 는 이 두 값을 별표(필수)로 렌더링하고 전송까지 하는데, 이 스키마에
   * 선언이 없어 zod 가 미지 키로 **조용히 제거**했다. 사용자는 "SR이 수정되었습니다"
   * 성공 토스트를 받지만 어느 값도 저장되지 않았고, 다이얼로그를 다시 열면 이전 값이
   * 그대로 보였다.
   *
   * 운영자 소유 필드(dueDate/actualPriority/assigneeId 등)와 달리 이 둘은 **요청자가
   * 소유**하므로 필드 단위 인가에서 제한하지 않는다.
   */
  requestedPriority: z.preprocess(
    emptyStringToUndefined,
    z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional()
  ),
  requestedCompletionDate: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
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
  resolutionDescription: z.preprocess(
    emptyStringToNull,
    z.string().max(FIELD_LIMITS.NOTE).optional().nullable()
  ),
  rejectionReason: z.preprocess(
    emptyStringToNull,
    z.string().max(FIELD_LIMITS.NOTE).optional().nullable()
  ),
  satisfactionRating: z.preprocess(
    (val) => (val === '' ? null : typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().min(1).max(5).optional().nullable()
  ),
  additionalFeedback: z.preprocess(
    emptyStringToNull,
    z.string().max(FIELD_LIMITS.NOTE).optional().nullable()
  ),
  actualPriority: z.preprocess(
    emptyStringToUndefined,
    z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional()
  ),
  estimatedHours: z.preprocess(
    (val) => (val === '' ? null : typeof val === 'string' ? parseFloat(val) : val),
    z.number().positive('예상 작업 시간은 0보다 커야 합니다').optional().nullable()
  ),
  estimatedCompletionDate: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  intakeNotes: z.preprocess(
    emptyStringToNull,
    z.string().max(FIELD_LIMITS.NOTE).optional().nullable()
  ),
  assigneeId: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1, '담당자를 선택해주세요').optional()
  ),
  changeReason: z.preprocess(
    emptyStringToUndefined,
    z.string().max(FIELD_LIMITS.SHORT_TEXT).optional()
  ),
});

// User Schemas
export const userCreateSchema = z.object({
  name: z
    .string()
    .min(1, '이름을 입력해주세요.')
    .max(FIELD_LIMITS.NAME, `이름은 ${FIELD_LIMITS.NAME}자를 초과할 수 없습니다.`),
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: passwordSchema,
  userType: z.enum(['ENGINEER', 'CLIENT']).optional(),
  clientId: z.string().optional(),
  clientIds: z.array(z.string()).optional(),
  roleIds: z.array(z.string()).optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요.').max(FIELD_LIMITS.NAME).optional(),
  email: z.string().email('유효한 이메일 주소를 입력해주세요.').optional(),
  image: z.string().url('유효한 이미지 URL을 입력해주세요.').max(FIELD_LIMITS.URL).optional(),
  isActive: z.boolean().optional(),
  clientIds: z.array(z.string()).optional(),
  /**
   * 관리자에 의한 비밀번호 재설정.
   *
   * 이 키가 없으면 zod 가 알 수 없는 키로 조용히 제거해, UI 는 성공 토스트를 띄우지만
   * 비밀번호는 바뀌지 않는다(감사 3.17). 평문으로 받아 서비스 계층에서 해싱한다.
   * 타인의 비밀번호 변경은 `USER:UPDATE` 보유자만 가능하도록 라우트에서 게이트한다.
   */
  password: passwordSchema.optional(),
});

// Role Schemas
export const roleCreateSchema = z.object({
  name: z
    .string()
    .min(1, '역할 이름을 입력해주세요.')
    .max(FIELD_LIMITS.NAME, `역할 이름은 ${FIELD_LIMITS.NAME}자를 초과할 수 없습니다.`),
  description: z.string().max(FIELD_LIMITS.SHORT_TEXT).optional(),
});

export const roleUpdateSchema = roleCreateSchema.partial();

// SR Intake Schema - 접수 처리 전용
export const intakeSchema = z.object({
  actualPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  estimatedHours: z.number().positive('예상 작업 시간은 0보다 커야 합니다'),
  estimatedCompletionDate: z.string(),
  intakeNotes: z.string().max(FIELD_LIMITS.NOTE).optional(),
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
  intakeNotes: z.string().max(FIELD_LIMITS.NOTE).optional().nullable(),
  assigneeId: z.string().min(1, '담당자를 선택해주세요').optional(),
});

// ServiceCategory Schemas
export const serviceCategoryCreateSchema = z.object({
  categoryName: z
    .string()
    .min(1, '카테고리 이름을 입력해주세요.')
    .max(
      FIELD_LIMITS.DISPLAY_NAME,
      `카테고리 이름은 ${FIELD_LIMITS.DISPLAY_NAME}자를 초과할 수 없습니다.`
    ),
  description: z.preprocess(
    emptyStringToUndefined,
    z.string().max(FIELD_LIMITS.SHORT_TEXT).optional()
  ),
  slaHours: z.number().int().positive('SLA 시간은 0보다 커야 합니다.'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  clientId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  handlerId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
  backupHandlerId: z.preprocess(emptyStringToNull, z.string().optional().nullable()),
});

export const serviceCategoryUpdateSchema = serviceCategoryCreateSchema.partial();

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 본문 스키마
//
// 아래 넷은 각자의 라우트 파일 안에 선언돼 있었다. 규칙이 라우트에 흩어져 있으면
// "이 엔드포인트가 무엇을 받는가"를 알려면 파일을 열어야 하고, 같은 필드에 대한
// 상한이 파일마다 어긋나도 아무도 모른다. 규칙 자체는 그대로 옮긴 순수 이동이다.
//
// **`profile/route.ts` 의 `updateProfileSchema` 는 여기로 옮기지 않는다.**
// 그쪽은 avatar 에 `.or(z.literal(''))` 가 붙어 있고 그게 "아바타 지우기" 경로다
// (settings/profile/page.tsx). 아래 userUpdateSchema 에는 그 분기가 없어서,
// 합치면 아바타를 지울 수 없게 된다.
// ─────────────────────────────────────────────────────────────────────────────

/** SR 댓글 본문. 상한이 없으면 인증된 단일 POST 로 무제한 TEXT 를 영속시킬 수 있다(감사 4.3). */
export const commentSchema = z.object({
  content: z
    .string()
    .min(1, '댓글 내용을 입력해주세요.')
    .max(FIELD_LIMITS.NOTE, `댓글은 ${FIELD_LIMITS.NOTE}자를 초과할 수 없습니다.`),
});

/** SR 상태 전이 요청. 실제 전이 가능 여부는 sr-state-machine 이 판정한다. */
export const statusActionSchema = z.object({
  action: z.enum(['complete', 'hold', 'reject', 'reopen', 'start', 'resume', 'confirm']),
  // trim().min(1) 이 필요한 이유: 라우트는 `!reason` 으로만 필수 여부를 판정한다.
  // 공백뿐인 문자열('   ')은 truthy 라 그 검사를 그대로 통과했고, 보류·거절·재오픈의
  // 사유가 공백인 채로 상태 이력에 남았다. 감사 추적이 있으나 마나 해진다.
  // trim 은 preprocess 가 아니라 스키마 단계에서 하므로 저장되는 값도 정리된다.
  reason: z.string().trim().min(1, '사유를 입력해주세요.').optional(),
  resolutionDescription: z.string().trim().min(1, '해결 내용을 입력해주세요.').optional(),
});

/** 사용자 고객사 소속 변경. `force` 는 진행 중 SR 이 있어도 강행할지 여부다. */
export const clientAssignSchema = z.object({
  clientId: z.string().min(1, '고객사 ID가 필요합니다'),
  force: z.boolean().optional(),
});

/** 사용자 역할 배정. 빈 배열은 "역할 전부 해제"라는 의미이므로 min(1) 을 걸지 않는다. */
export const roleAssignSchema = z.object({
  roleIds: z.array(z.string()),
});
