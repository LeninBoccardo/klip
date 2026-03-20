/**
 * Convert a string into a URL/filesystem-safe slug.
 *
 * Rules:
 * 1. NFD normalize and strip diacritical marks (é → e)
 * 2. Lowercase
 * 3. Replace spaces and underscores with hyphens
 * 4. Strip all non-alphanumeric characters (except hyphens)
 * 5. Collapse consecutive hyphens
 * 6. Trim leading/trailing hyphens
 *
 * Pure function — no external dependencies.
 */
export function slugify(input: string): string {
  return (
    input
      // Decompose unicode characters (é → e + combining accent)
      .normalize('NFD')
      // Strip combining diacritical marks
      .replace(/[\u0300-\u036f]/g, '')
      // Lowercase
      .toLowerCase()
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, '-')
      // Strip all non-alphanumeric/non-hyphen characters
      .replace(/[^a-z0-9-]/g, '')
      // Collapse consecutive hyphens
      .replace(/-{2,}/g, '-')
      // Trim leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
  )
}
