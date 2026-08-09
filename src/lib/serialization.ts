/**
 * Date serialization utility for API responses
 * Converts Date objects to ISO strings for JSON serialization
 */

/**
 * Deeply serializes an object, converting Dates to ISO strings
 * and matching JSON.stringify behavior for other types.
 *
 * @param value - The value to serialize
 * @returns The serialized value
 */
function deepSerialize(value: any): any {
  // Handle primitives and null
  if (value === null || value === undefined) {
    return value;
  }

  // Handle Prisma / decimal.js Decimal
  //
  // ⚠️ `value.constructor.name === 'Decimal'` 로 판별하지 말 것.
  // 프로덕션 번들은 클래스 이름을 축약하므로 실제 Prisma Decimal 의 constructor.name 은
  // 'Decimal' 이 아니라 'i' 같은 한 글자다. 그 조건이 붙어 있던 동안 이 분기가
  // 프로덕션에서만 통째로 건너뛰어졌고, Decimal 값이 toJSON() 을 타고 **문자열**로 나갔다.
  // 실제 피해: GET /api/srs/{id}/intake 의 estimatedHours 가 "4"(string)로 내려와
  // 접수 정보 수정 폼(z.number())이 로드 즉시 무효가 되고, 저장을 눌러도 PATCH 가
  // 한 번도 나가지 않았다 — 프로덕션에서 접수 정보 수정이 불가능했다.
  //
  // 이 결함이 오래 남은 이유는 단위 테스트가 자체 정의한 `class Decimal` 을 썼기 때문이다.
  // 그 가짜의 constructor.name 은 'Decimal' 이라 언제나 통과했다.
  // 아래 덕 타이핑은 축약에 영향받지 않는다. (Prisma 결과 객체 중 toNumber() 를 가진 것은
  // Decimal 뿐이다.)
  if (value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }

  if (typeof value === 'number') {
    // JSON.stringify converts NaN and Infinity to null
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  // Handle BigInt (Prisma BigInt columns, e.g. SRAttachment.fileSize)
  // JSON.stringify throws a TypeError on bigint, so it must be converted before
  // it ever reaches NextResponse.json. Number() is lossless for every bigint the
  // schema can produce (fileSize is capped at 10MB, far below Number.MAX_SAFE_INTEGER).
  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value !== 'object') {
    // Primitives (string, boolean, symbol, etc.)
    // Note: JSON.stringify ignores symbols.
    // We preserve them here if they are passed directly, but they might be handled differently in objects/arrays.
    // For direct calls, we return as is.
    return value;
  }

  // Handle Date
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle Array
  if (Array.isArray(value)) {
    return value.map((item) => {
      // JSON.stringify converts undefined, function, symbol in arrays to null
      if (typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol') {
        return null;
      }
      return deepSerialize(item);
    });
  }

  // Handle objects with toJSON
  if (typeof value.toJSON === 'function') {
    return value.toJSON();
  }

  // Handle plain objects
  const result: any = {};
  for (const key in value) {
    // Only iterate own enumerable properties
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const val = value[key];
      // JSON.stringify skips undefined, function, symbol in objects
      if (typeof val !== 'undefined' && typeof val !== 'function' && typeof val !== 'symbol') {
        result[key] = deepSerialize(val);
      }
    }
  }
  return result;
}

/**
 * Serializes data by converting all Date objects to ISO strings
 * @param data - Data to serialize (can be object, array, or primitive)
 * @returns Serialized data with Date objects converted to ISO strings
 */
export function serializeResponse<T>(data: T): T {
  // Optimized recursive traversal to replace JSON.parse(JSON.stringify())
  return deepSerialize(data);
}

/**
 * Serializes an array of data items
 * @param items - Array of items to serialize
 * @returns Serialized array with all Date objects converted to ISO strings
 */
export function serializeMany<T>(items: T[]): T[] {
  return serializeResponse(items);
}

/**
 * Manually serialize specific date fields in an object
 * Useful when you want explicit control over which fields to serialize
 * @param obj - Object containing date fields
 * @param dateFields - Array of field names that contain Date objects
 * @returns Object with specified date fields converted to ISO strings
 */
export function serializeDates<T extends Record<string, unknown>>(
  obj: T,
  dateFields: (keyof T)[]
): T {
  const result = { ...obj };
  for (const field of dateFields) {
    const value = result[field];
    if (value instanceof Date) {
      result[field] = value.toISOString() as T[keyof T];
    } else if (value === null || value === undefined) {
      result[field] = value as T[keyof T];
    }
  }
  return result;
}
