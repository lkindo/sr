/**
 * FormData 파싱 유틸리티
 * 타입 안전한 FormData 파싱 및 검증
 */

import { z } from "zod";

/**
 * FormData에서 값을 안전하게 추출
 */
export function getFormDataValue(
  formData: FormData,
  key: string
): string | null {
  const value = formData.get(key);
  return value instanceof File ? null : (value as string | null);
}

/**
 * FormData에서 여러 값을 한 번에 추출
 */
export function getFormDataValues(
  formData: FormData,
  keys: string[]
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    result[key] = getFormDataValue(formData, key);
  }
  return result;
}

/**
 * FormData를 객체로 변환 (빈 문자열 처리 포함)
 */
export function formDataToObject(formData: FormData): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      continue; // 파일은 별도 처리
    }
    result[key] = value as string | null;
  }
  return result;
}

/**
 * FormData를 Zod 스키마로 파싱 및 검증
 * 
 * @example
 * ```typescript
 * const data = parseFormData(formData, srCreateSchema);
 * ```
 */
export function parseFormData<T>(
  formData: FormData,
  schema: z.ZodSchema<T>
): T {
  const data = formDataToObject(formData);
  return schema.parse(data);
}

/**
 * 빈 문자열을 null 또는 undefined로 변환하는 헬퍼
 */
export function normalizeFormDataValue(
  value: string | null | undefined,
  options: {
    emptyAs?: "null" | "undefined";
    enumFields?: string[];
  } = {}
): string | null | undefined {
  const { emptyAs = "null", enumFields = [] } = options;

  if (value === "" || value === null) {
    return emptyAs === "null" ? null : undefined;
  }

  return value;
}

/**
 * FormData의 빈 문자열을 적절히 처리하여 객체 생성
 */
export function processFormData<T extends Record<string, unknown>>(
  formData: FormData,
  fieldConfig: {
    [K in keyof T]?: {
      emptyAs?: "null" | "undefined";
      transform?: (value: string | null) => T[K];
    };
  }
): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, config] of Object.entries(fieldConfig)) {
    const value = getFormDataValue(formData, key);
    const processedValue = normalizeFormDataValue(value, {
      emptyAs: config?.emptyAs || "null",
    });

    if (config?.transform) {
      result[key as keyof T] = config.transform(processedValue) as T[Extract<keyof T, string>];
    } else {
      result[key as keyof T] = processedValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

