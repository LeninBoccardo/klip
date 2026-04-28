import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAppStore } from '@/hooks/use-app-store'
import type { DownloadProgress, VideoInfo, DownloadVideoResult } from '@shared/types'

export function useFetchVideoInfo(): UseMutationResult<VideoInfo, Error, string> {
  return useMutation({
    mutationFn: (url: string) => window.api.fetchVideoInfo(url)
  })
}

export function useDownloadVideo(): UseMutationResult<
  DownloadVideoResult,
  Error,
  { url: string; creatorName: string }
> {
  return useMutation({
    mutationFn: ({ url, creatorName }: { url: string; creatorName: string }) =>
      window.api.downloadVideo(url, creatorName)
  })
}

export function useCancelDownload(): UseMutationResult<void, Error, string> {
  return useMutation({
    mutationFn: (downloadId: string) => window.api.cancelDownload(downloadId)
  })
}

/**
 * Subscribes to real-time download progress events and syncs them into zustand.
 * Mount once near the root or on the downloads page.
 */
export function useDownloadProgressListener(): void {
  const upsertDownload = useAppStore((s) => s.upsertDownload)
  const removeDownload = useAppStore((s) => s.removeDownload)

  useEffect(() => {
    const unsubscribe = window.api.onDownloadProgress((_event, data: DownloadProgress) => {
      if (data.status === 'complete' || data.status === 'error' || data.status === 'cancelled') {
        // Keep it briefly for the UI to show final state, then remove
        upsertDownload(data)
        setTimeout(() => removeDownload(data.downloadId), 3000)
      } else {
        upsertDownload(data)
      }
    })
    return unsubscribe
  }, [upsertDownload, removeDownload])
}
