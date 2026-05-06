import { useEffect } from 'react'
import { useEditorStore } from './use-editor-store'

/**
 * Subscribe to `render-progress` push events from main and feed them
 * into the editor store. Mount once near the editor app's root —
 * the store filters on the `activeJobId` so stale events from
 * previously-tracked jobs are dropped without leaking into the UI.
 *
 * The unsubscribe function returned from the preload listener is
 * called on unmount to avoid leaking listeners across editor-window
 * reopens. The same hook is also mountable in the main window's
 * sidebar progress chip (phase 8) — both can listen simultaneously
 * because the channel is broadcast to all webContents.
 */
export function useRenderProgressListener(): void {
  const updateJob = useEditorStore((s) => s.updateJob)

  useEffect(() => {
    const unsubscribe = window.api.onRenderProgress((_event, data) => {
      updateJob({
        jobId: data.jobId,
        status: data.status,
        percent: data.percent,
        errorMessage: data.errorMessage
      })
    })
    return unsubscribe
  }, [updateJob])
}
