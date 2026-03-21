/**
 * Escape SQLite LIKE wildcards in a user-provided search string.
 * Uses backslash as the escape character (paired with ESCAPE '\\' in the query).
 */
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}
