import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@/hooks/use-app-store'
import type { DownloadProgress } from '@shared/types'

const makeProgress = (overrides: Partial<DownloadProgress> = {}): DownloadProgress => ({
  downloadId: 'dl-1',
  url: 'https://youtube.com/watch?v=abc',
  percent: 50,
  speed: '1.2 MB/s',
  eta: '00:30',
  status: 'downloading',
  ...overrides
})

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useAppStore.setState({ activeDownloads: {} })
  })

  it('starts with empty active downloads', () => {
    expect(useAppStore.getState().activeDownloads).toEqual({})
  })

  it('upsertDownload adds a new download', () => {
    const progress = makeProgress()
    useAppStore.getState().upsertDownload(progress)

    expect(useAppStore.getState().activeDownloads['dl-1']).toEqual(progress)
  })

  it('upsertDownload updates an existing download', () => {
    useAppStore.getState().upsertDownload(makeProgress({ percent: 25 }))
    useAppStore.getState().upsertDownload(makeProgress({ percent: 75 }))

    expect(useAppStore.getState().activeDownloads['dl-1'].percent).toBe(75)
  })

  it('upsertDownload handles multiple downloads', () => {
    useAppStore.getState().upsertDownload(makeProgress({ downloadId: 'dl-1' }))
    useAppStore.getState().upsertDownload(makeProgress({ downloadId: 'dl-2' }))

    const downloads = useAppStore.getState().activeDownloads
    expect(Object.keys(downloads)).toHaveLength(2)
    expect(downloads['dl-1']).toBeDefined()
    expect(downloads['dl-2']).toBeDefined()
  })

  it('removeDownload removes a specific download', () => {
    useAppStore.getState().upsertDownload(makeProgress({ downloadId: 'dl-1' }))
    useAppStore.getState().upsertDownload(makeProgress({ downloadId: 'dl-2' }))

    useAppStore.getState().removeDownload('dl-1')

    const downloads = useAppStore.getState().activeDownloads
    expect(downloads['dl-1']).toBeUndefined()
    expect(downloads['dl-2']).toBeDefined()
  })

  it('removeDownload is a no-op for unknown ids', () => {
    useAppStore.getState().upsertDownload(makeProgress({ downloadId: 'dl-1' }))
    useAppStore.getState().removeDownload('unknown')

    expect(Object.keys(useAppStore.getState().activeDownloads)).toHaveLength(1)
  })

  it('clearDownloads empties all downloads', () => {
    useAppStore.getState().upsertDownload(makeProgress({ downloadId: 'dl-1' }))
    useAppStore.getState().upsertDownload(makeProgress({ downloadId: 'dl-2' }))

    useAppStore.getState().clearDownloads()

    expect(useAppStore.getState().activeDownloads).toEqual({})
  })
})
