import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import type { MigrateRootResult } from '@shared/types'
import { useMigrateRoot } from '@/hooks/use-migrate-root'
import { useAppStore } from '@/hooks/use-app-store'
import { queryKeys } from '@/lib/query-keys'
import { renderMutationHook } from '../helpers/test-utils'

const migrateRoot = vi.fn()
const selectFolder = vi.fn()
const onMigrateRootProgress = vi.fn(() => () => {})

beforeEach(() => {
  migrateRoot.mockReset()
  selectFolder.mockReset()
  onMigrateRootProgress.mockReset().mockReturnValue(() => {})
  useAppStore.setState({ blockingOperation: null, activeDownloads: {} })
  Object.defineProperty(window, 'api', {
    value: { migrateRoot, selectFolder, onMigrateRootProgress },
    writable: true,
    configurable: true
  })
})

describe('useMigrateRoot', () => {
  it('subscribes to migrate-root progress events on mount', () => {
    renderMutationHook(() => useMigrateRoot())
    expect(onMigrateRootProgress).toHaveBeenCalledOnce()
  })

  it('invalidates settings, creators, videos, and cuts on a successful migration', async () => {
    migrateRoot.mockResolvedValue({ success: true, movedCount: 3 } satisfies MigrateRootResult)
    const { result, invalidateSpy } = renderMutationHook(() => useMigrateRoot())

    act(() => {
      result.current.mutation.mutate('/new/root')
    })

    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))

    expect(migrateRoot).toHaveBeenCalledWith('/new/root')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.settings.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.creators.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.videos.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cuts.all })
    expect(invalidateSpy).toHaveBeenCalledTimes(4)
    // Blocking op cleared after success.
    expect(useAppStore.getState().blockingOperation).toBeNull()
  })

  it('skips invalidation when the use-case reports a failure (success=false)', async () => {
    migrateRoot.mockResolvedValue({
      success: false,
      movedCount: 0,
      error: 'disk full'
    } satisfies MigrateRootResult)
    const { result, invalidateSpy } = renderMutationHook(() => useMigrateRoot())

    act(() => {
      result.current.mutation.mutate('/new/root')
    })

    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(useAppStore.getState().blockingOperation).toBeNull()
  })

  it('clears the blocking op on error and does not invalidate', async () => {
    migrateRoot.mockRejectedValue(new Error('IPC crashed'))
    const { result, invalidateSpy } = renderMutationHook(() => useMigrateRoot())

    act(() => {
      result.current.mutation.mutate('/new/root')
    })

    await waitFor(() => expect(result.current.mutation.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(useAppStore.getState().blockingOperation).toBeNull()
  })

  it('selectFolder delegates to window.api.selectFolder', async () => {
    selectFolder.mockResolvedValue('/picked/folder')
    const { result } = renderMutationHook(() => useMigrateRoot())

    const picked = await result.current.selectFolder()

    expect(selectFolder).toHaveBeenCalledOnce()
    expect(picked).toBe('/picked/folder')
  })
})
