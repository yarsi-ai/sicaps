/**
 * Runtime type guards for Prisma JSON fields.
 * Prisma types JSON columns as `JsonValue` (essentially `unknown`).
 * These helpers provide safe parsing with fallbacks instead of unsafe `as` casts.
 */

/**
 * Parse a Prisma JSON field expected to be a Record<string, number> (e.g., scores).
 * Returns empty object if the value is null, not an object, or an array.
 */
export function parseScores(raw: unknown): Record<string, number> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, number>;
  }
  return {};
}

/**
 * Parse a Prisma JSON field expected to be a string[] (e.g., categoriesCovered).
 * Returns empty array if the value is null or not an array.
 */
export function parseCategoriesCovered(raw: unknown): string[] {
  return Array.isArray(raw) ? (raw as string[]) : [];
}
