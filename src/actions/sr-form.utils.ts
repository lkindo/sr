import { z } from "zod"
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas"
import { getFormDataValue } from "@/lib/form-data-parser"

export type SRCreateInput = z.infer<typeof srCreateSchema>
export type SRUpdateInput = z.infer<typeof srUpdateSchema>

/**
 * FormData를 SR 생성 입력 객체로 변환합니다.
 */
export function buildSRCreateInput(formData: FormData): SRCreateInput {
  return Object.fromEntries(formData) as any;
}

/**
 * FormData를 SR 수정 입력 객체로 변환합니다.
 */
export function buildSRUpdateInput(formData: FormData): Record<string, any> {
  return Object.fromEntries(formData);
}

