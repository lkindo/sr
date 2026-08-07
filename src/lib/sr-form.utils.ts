import { z } from 'zod';

import { srCreateSchema } from '@/lib/schemas';

type SRCreateInput = z.infer<typeof srCreateSchema>;

/**
 * FormData를 SR 생성 입력 객체로 변환합니다.
 */
export function buildSRCreateInput(formData: FormData): SRCreateInput {
  return Object.fromEntries(formData) as unknown as SRCreateInput;
}

/**
 * FormData를 SR 수정 입력 객체로 변환합니다.
 */
export function buildSRUpdateInput(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData) as Record<string, unknown>;
}
