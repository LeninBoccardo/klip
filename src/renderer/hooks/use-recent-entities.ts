import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'klip:recent-entities:v1'
const MAX_RECENTS = 5

export type RecentEntityKind = 'creator' | 'video' | 'cut'

export interface RecentEntity {
  kind: RecentEntityKind
  id: string
  /** Display label (creator name, video/cut title) frozen at the time of visit. */
  label: string
  /** For cuts: the parent creator id, so navigation knows where to land. */
  creatorId?: string
  visitedAt: number
}

function readStorage(): RecentEntity[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentEntity).slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

function isRecentEntity(value: unknown): value is RecentEntity {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    (r.kind === 'creator' || r.kind === 'video' || r.kind === 'cut') &&
    typeof r.id === 'string' &&
    typeof r.label === 'string' &&
    typeof r.visitedAt === 'number'
  )
}

function writeStorage(entries: RecentEntity[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage can throw under quota or private-browsing flags. Recents
    // are best-effort UX; silently degrade rather than crash the palette.
  }
}

/**
 * Persists the last 5 entities the user opened from the command palette.
 *
 * Why localStorage and not the DB: recents are a UI-only personalisation
 * scoped to this renderer's user — they don't belong in the audit log, don't
 * sync across machines, and don't need transactional guarantees. Putting
 * them in the DB would force a schema migration for a feature that's
 * functionally a sidebar history.
 */
export function useRecentEntities(): {
  recents: RecentEntity[]
  addRecent: (entity: Omit<RecentEntity, 'visitedAt'>) => void
  clearRecents: () => void
} {
  const [recents, setRecents] = useState<RecentEntity[]>(() => readStorage())

  // Keep tabs in sync — if the user opens the palette in one renderer instance
  // and the recents change underneath, mirror the latest state on focus.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY) setRecents(readStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const addRecent = useCallback((entity: Omit<RecentEntity, 'visitedAt'>) => {
    setRecents((prev) => {
      const next = [
        { ...entity, visitedAt: Date.now() },
        ...prev.filter((e) => !(e.kind === entity.kind && e.id === entity.id))
      ].slice(0, MAX_RECENTS)
      writeStorage(next)
      return next
    })
  }, [])

  const clearRecents = useCallback(() => {
    writeStorage([])
    setRecents([])
  }, [])

  return { recents, addRecent, clearRecents }
}
