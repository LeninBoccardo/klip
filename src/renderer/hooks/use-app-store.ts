import { create } from 'zustand'
import type { DownloadProgress } from '@shared/types'

interface AppState {
  /** Active downloads keyed by downloadId */
  activeDownloads: Record<string, DownloadProgress>

  /** Insert or update a download progress entry */
  upsertDownload: (progress: DownloadProgress) => void
  /** Remove a completed/cancelled download from the map */
  removeDownload: (downloadId: string) => void
  /** Clear all active downloads */
  clearDownloads: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeDownloads: {},

  upsertDownload: (progress) =>
    set((state) => ({
      activeDownloads: { ...state.activeDownloads, [progress.downloadId]: progress }
    })),

  removeDownload: (downloadId) =>
    set((state) => {
      const { [downloadId]: _, ...rest } = state.activeDownloads
      return { activeDownloads: rest }
    }),

  clearDownloads: () => set({ activeDownloads: {} })
}))
