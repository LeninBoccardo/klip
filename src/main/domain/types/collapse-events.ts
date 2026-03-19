import type { FileEvent, FileEventType } from './file-event'

type CollapseKey = `${FileEventType}->${FileEventType}`

/**
 * Lookup table for collapsing sequential events on the same path.
 *
 * - `FileEventType` → collapsed result
 * - `null`          → IGNORE (transient pair, discard both)
 * - `undefined`     → unlisted combination, latest event wins
 *
 * Rules derived from chokidar's event semantics:
 * - File events:  add, change, unlink
 * - Dir events:   addDir, unlinkDir
 * - Mixed events: directory type always dominates
 */
const COLLAPSE_RULES: Partial<Record<CollapseKey, FileEventType | null>> = {
  // ── File × File ──
  'add->add': 'add', //       duplicate
  'add->change': 'add', //    still just created
  'add->unlink': null, //     transient (create → delete)
  'change->change': 'change', // latest wins
  'change->unlink': 'unlink', // file removed
  'unlink->add': 'change', //   delete → recreate
  'unlink->change': 'change', // treat as recreate
  'unlink->unlink': 'unlink', // duplicate

  // ── Dir × Dir ──
  'addDir->addDir': 'addDir', //       duplicate
  'addDir->unlinkDir': null, //        transient
  'unlinkDir->addDir': 'change', //    recreated
  'unlinkDir->unlinkDir': 'unlinkDir', // duplicate

  // ── Mixed (dir ↔ file on same path): directory events dominate ──
  'addDir->add': 'addDir', //       dir dominates
  'add->addDir': 'addDir', //       dir replaces file
  'unlinkDir->unlink': 'unlinkDir', // dir dominates
  'unlink->unlinkDir': 'unlinkDir' //  dir dominates
}

/**
 * Collapses a sequence of file events by path, applying the collapsing rules.
 * Returns at most one event per unique path.
 *
 * @param events  Raw event buffer (order matters within each path)
 * @returns Deduplicated, collapsed events
 */
export function collapseEvents(events: FileEvent[]): FileEvent[] {
  if (events.length === 0) return []

  const collapsed = new Map<string, FileEventType>()

  for (const event of events) {
    const current = collapsed.get(event.path)

    if (current === undefined) {
      // First event for this path
      collapsed.set(event.path, event.type)
      continue
    }

    const key: CollapseKey = `${current}->${event.type}`
    const rule = COLLAPSE_RULES[key]

    if (rule === undefined) {
      // Unlisted combination: latest event wins
      collapsed.set(event.path, event.type)
    } else if (rule === null) {
      // Transient pair: discard entirely
      collapsed.delete(event.path)
    } else {
      collapsed.set(event.path, rule)
    }
  }

  return Array.from(collapsed, ([path, type]) => ({ type, path }))
}
