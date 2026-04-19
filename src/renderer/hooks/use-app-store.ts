import { create } from 'zustand'
import type { DownloadProgress, MigrateRootProgress } from '@shared/types'

interface BlockingOperation {
  title: string
  description?: string
  progress?: MigrateRootProgress
}

interface AppState {
  /** Active downloads keyed by downloadId */
  activeDownloads: Record<string, DownloadProgress>

  /** Blocking operation (non-dismissable dialog) — null when idle */
  blockingOperation: BlockingOperation | null

  /** Insert or update a download progress entry */
  upsertDownload: (progress: DownloadProgress) => void
  /** Remove a completed/cancelled download from the map */
  removeDownload: (downloadId: string) => void
  /** Clear all active downloads */
  clearDownloads: () => void

  /** Start a blocking operation (shows non-dismissable dialog) */
  startBlockingOperation: (title: string, description?: string) => void
  /** Update progress on the current blocking operation */
  updateBlockingProgress: (progress: MigrateRootProgress) => void
  /** End the blocking operation (closes dialog) */
  endBlockingOperation: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeDownloads: {},
  blockingOperation: null,

  upsertDownload: (progress) =>
    set((state) => ({
      activeDownloads: { ...state.activeDownloads, [progress.downloadId]: progress }
    })),

  removeDownload: (downloadId) =>
    set((state) => {
      const { [downloadId]: _, ...rest } = state.activeDownloads
      return { activeDownloads: rest }
    }),

  clearDownloads: () => set({ activeDownloads: {} }),

  startBlockingOperation: (title, description) =>
    set({ blockingOperation: { title, description } }),

  updateBlockingProgress: (progress) =>
    set((state) => ({
      blockingOperation: state.blockingOperation ? { ...state.blockingOperation, progress } : null
    })),

  endBlockingOperation: () => set({ blockingOperation: null })
}))
