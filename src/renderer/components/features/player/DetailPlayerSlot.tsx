import { useEffect, useRef } from 'react'
import { AspectRatio } from '@ui/aspect-ratio'
import { usePlayerSlot } from './player-slot-ref'
import { usePlayerStore } from '@/hooks/use-player-store'

/**
 * Reserves the in-page area where the persistent player overlays itself when
 * the user is on the video detail page.
 *
 * The ratio matches a standard 16:9 video frame so the page layout doesn't
 * jump when the player attaches/detaches. The player itself is rendered at
 * the root and positioned over this slot via fixed positioning — see
 * `PersistentPlayer`.
 *
 * On unmount we deregister the slot and demote `mode` to `mini`/`paused`/`idle`
 * (per the user's `playbackOnNavigate` setting). The route-change effect in
 * `PersistentPlayer` is the canonical place to apply nav-behavior, but
 * unmount is the deterministic moment we know the slot is gone.
 */
export function DetailPlayerSlot(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const setElement = usePlayerSlot((s) => s.setElement)

  useEffect(() => {
    // Snapshot the DOM node now so the cleanup compares against the same
    // element React handed us at mount time, not whatever `ref.current`
    // happens to point to after re-mounts.
    const node = ref.current
    setElement(node)
    return () => {
      const current = usePlayerSlot.getState().element
      if (current === node) setElement(null)

      // If the player was attached to the detail surface and we're leaving it,
      // demote `mode` according to the user's nav-behavior preference. The
      // store is the single source of truth so re-mounting the slot from a
      // new route picks up the in-flight playback automatically.
      const player = usePlayerStore.getState()
      if (player.mode !== 'detail') return
      if (player.navBehavior === 'floating') player.setMode('mini')
      else if (player.navBehavior === 'pause') player.setMode('paused')
      else player.stop()
    }
  }, [setElement])

  return (
    <div ref={ref} className="bg-muted overflow-hidden rounded-xl border" data-player-slot>
      <AspectRatio ratio={16 / 9} />
    </div>
  )
}
