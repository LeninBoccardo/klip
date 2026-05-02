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
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}
