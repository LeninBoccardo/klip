/**
 * Compute a JSON-serialized diff between two objects.
 * Skips `updatedAt` (always changes, not interesting for audit).
 * Returns null if no meaningful changes detected.
 */
export function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): string | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  for (const key of Object.keys(newObj)) {
    if (key === 'updatedAt') continue
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      changes[key] = { old: oldObj[key], new: newObj[key] }
    }
  }
  return Object.keys(changes).length > 0 ? JSON.stringify(changes) : null
}
