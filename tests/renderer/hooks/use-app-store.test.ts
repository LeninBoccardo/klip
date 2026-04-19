import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@/hooks/use-app-store'
import type { DownloadProgress, MigrateRootProgress } from '@shared/types'

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
    useAppStore.setState({ activeDownloads: {}, blockingOperation: null })
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

  // ── Blocking operation ──

  it('starts with no blocking operation', () => {
    expect(useAppStore.getState().blockingOperation).toBeNull()
  })

  it('startBlockingOperation sets the blocking state', () => {
    useAppStore.getState().startBlockingOperation('Migrating', 'Moving files…')

    const op = useAppStore.getState().blockingOperation
    expect(op).toEqual({ title: 'Migrating', description: 'Moving files…' })
  })

  it('updateBlockingProgress updates progress on the current operation', () => {
    useAppStore.getState().startBlockingOperation('Migrating')

    const progress: MigrateRootProgress = {
      phase: 'moving',
      current: 2,
      total: 5,
      currentFolder: 'creator-a'
    }
    useAppStore.getState().updateBlockingProgress(progress)

    expect(useAppStore.getState().blockingOperation?.progress).toEqual(progress)
  })

  it('updateBlockingProgress is a no-op when no operation is active', () => {
    const progress: MigrateRootProgress = { phase: 'moving', current: 1, total: 1 }
    useAppStore.getState().updateBlockingProgress(progress)

    expect(useAppStore.getState().blockingOperation).toBeNull()
  })

  it('endBlockingOperation clears the blocking state', () => {
    useAppStore.getState().startBlockingOperation('Migrating')
    useAppStore.getState().endBlockingOperation()

    expect(useAppStore.getState().blockingOperation).toBeNull()
  })
})
