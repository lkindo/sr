import { z } from "zod";

// Client Schemas
export const clientCreateSchema = z.object({
  code: z.string().min(2, "고객사 코드는 최소 2자 이상이어야 합니다."),
  name: z.string().min(1, "고객사 이름을 입력해주세요."),
  industry: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email("유효한 이메일 주소를 입력해주세요.").optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
});

export const clientUpdateSchema = clientCreateSchema.omit({ code: true }).partial();

// SR Schemas
export const srCreateSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다."),
  description: z.string().min(10, "설명은 최소 10자 이상이어야 합니다."),
  clientId: z.string().min(1, "고객사를 선택해주세요."),
  serviceCategoryId: z.string().min(1, "서비스 카테고리를 선택해주세요."),
  requestedPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  requestedCompletionDate: z.string().optional(),
});

export const srUpdateSchema = z.object({
  title: z.string().min(5, "제목은 최소 5자 이상이어야 합니다.").optional(),
  description: z.string().min(10, "설명은 최소 10자 이상이어야 합니다.").optional(),
  serviceCategoryId: z.string().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum([
    "REQUESTED", "INTAKE", "IN_PROGRESS", "ON_HOLD",
    "COMPLETED", "CONFIRMED", "REJECTED",
  ]).optional(),
  assignedToId: z.string().optional().nullable(),
  expectedCompletionDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  actualCompletionDate: z.string().optional().nullable(),
  resolutionDescription: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  satisfactionRating: z.number().min(1).max(5).optional().nullable(),
  additionalFeedback: z.string().optional().nullable(),
  actualPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  estimatedHours: z.number().positive("예상 작업 시간은 0보다 커야 합니다").optional(),
  estimatedCompletionDate: z.string().optional(),
  intakeNotes: z.string().optional(),
  assigneeId: z.string().min(1, "담당자를 선택해주세요").optional(),
  changeReason: z.string().optional(),
});

// User Schemas
export const userUpdateSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요.").optional(),
  email: z.string().email("유효한 이메일 주소를 입력해주세요.").optional(),
  image: z.string().url("유효한 이미지 URL을 입력해주세요.").optional(),
  isActive: z.boolean().optional(),
});

// Role Schemas
export const roleCreateSchema = z.object({
  name: z.string().min(1, "역할 이름을 입력해주세요."),
  description: z.string().optional(),
});

export const roleUpdateSchema = roleCreateSchema.partial();

// SR Intake Schema - 접수 처리 전용
export const intakeSchema = z.object({
  actualPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  estimatedHours: z.number().positive("예상 작업 시간은 0보다 커야 합니다"),
  estimatedCompletionDate: z.string(),
  intakeNotes: z.string().optional(),
  assigneeId: z.string().min(1, "담당자를 선택해주세요"),
});

// SR Intake Update Schema - 접수 정보 수정 전용
export const intakeUpdateSchema = z.object({
  actualPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  estimatedHours: z.number().positive("예상 작업 시간은 0보다 커야 합니다").max(1000, "예상 작업 시간은 1000시간을 초과할 수 없습니다").optional(),
  estimatedCompletionDate: z.string().optional(),
  intakeNotes: z.string().optional().nullable(),
  assigneeId: z.string().min(1, "담당자를 선택해주세요").optional(),
});
