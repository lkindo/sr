import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind CSS 클래스 문자열을 병합하는 유틸리티 함수
 * 
 * @param inputs - 병합할 클래스 값들
 * @returns 병합된 클래스 문자열
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 객체를 순수한 JavaScript 객체로 변환하는 헬퍼 함수
 * Next.js 15의 Server Components에서 Client Components로 객체 전달 시 필요
 * 
 * @param obj - 변환할 객체
 * @returns 순수한 JavaScript 객체
 */
export function toPlainObject(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(toPlainObject);
  }

  const plainObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      plainObj[key] = toPlainObject(obj[key]);
    }
  }

  return plainObj;
}

/**
 * 세션 사용자 정보를 클라이언트 컴포넌트로 전달 가능한 순수 객체로 변환
 * 
 * @param session - NextAuth 세션 객체
 * @returns 클라이언트로 전달 가능한 순수 객체
 */
export function convertSessionToPlainObject(session: any) {
  if (!session?.user) {
    return undefined;
  }

  return toPlainObject({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    roles: session.user.roles,
    permissions: session.user.permissions,
  });
}