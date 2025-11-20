/**
 * Date serialization utility for API responses
 * Converts Date objects to ISO strings for JSON serialization
 */

/**
 * Custom JSON stringifier replacer function that handles Date objects
 */
function dateReplacer(key: string, value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

/**
 * Serializes data by converting all Date objects to ISO strings
 * @param data - Data to serialize (can be object, array, or primitive)
 * @returns Serialized data with Date objects converted to ISO strings
 */
export function serializeResponse<T>(data: T): T {
  // Use JSON.parse(JSON.stringify()) with custom replacer to handle nested dates
  return JSON.parse(JSON.stringify(data, dateReplacer));
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
