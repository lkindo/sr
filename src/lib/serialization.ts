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

  if (typeof value === 'number') {
    // JSON.stringify converts NaN and Infinity to null
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  if (typeof value !== 'object') {
    // Primitives (string, boolean, symbol, bigint, etc.)
    // Note: JSON.stringify ignores symbols, throws on bigint.
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
