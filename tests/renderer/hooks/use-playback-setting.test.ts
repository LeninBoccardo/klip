import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  usePlaybackOnNavigate,
  useSetPlaybackOnNavigate,
  usePlaybackSettingMirror
} from '@/hooks/use-playback-setting'
import { usePlayerStore } from '@/hooks/use-player-store'
import { queryKeys } from '@/lib/query-keys'
import { createQueryWrapper, renderMutationHook } from '../helpers/test-utils'

const getSetting = vi.fn()
const setSetting = vi.fn()

beforeEach(() => {
  getSetting.mockReset().mockResolvedValue('floating')
  setSetting.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    value: { getSetting, setSetting },
    writable: true,
    configurable: true
  })
  // Reset store to default before each test.
  act(() => usePlayerStore.getState().setNavBehavior('floating'))
})

describe('usePlaybackOnNavigate', () => {
  it('returns the persisted value when valid', async () => {
    getSetting.mockResolvedValue('pause')
    const { result } = renderHook(() => usePlaybackOnNavigate(), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getSetting).toHaveBeenCalledWith('playbackOnNavigate')
    expect(result.current.data).toBe('pause')
  })

  it('falls back to the default when the persisted value is missing or unrecognised', async () => {
    getSetting.mockResolvedValue(null)
    const { result } = renderHook(() => usePlaybackOnNavigate(), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe('floating')

    getSetting.mockResolvedValue('legacy-value')
    const { result: result2 } = renderHook(() => usePlaybackOnNavigate(), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result2.current.isSuccess).toBe(true))
    expect(result2.current.data).toBe('floating')
  })
})

describe('useSetPlaybackOnNavigate', () => {
  it('writes the setting and invalidates settings.all', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useSetPlaybackOnNavigate())

    act(() => {
      result.current.mutate('stop')
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(setSetting).toHaveBeenCalledWith('playbackOnNavigate', 'stop')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.settings.all })
  })
})

describe('usePlaybackSettingMirror', () => {
  it('mirrors the persisted value into the player store', async () => {
    getSetting.mockResolvedValue('pause')

    renderHook(() => usePlaybackSettingMirror(), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(usePlayerStore.getState().navBehavior).toBe('pause'))
  })
})
