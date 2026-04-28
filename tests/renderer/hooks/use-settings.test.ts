import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useSetSetting, useSetting, useSettings } from '@/hooks/use-settings'
import { queryKeys } from '@/lib/query-keys'
import { createQueryWrapper, renderMutationHook } from '../helpers/test-utils'

const setSetting = vi.fn()
const getSettings = vi.fn()
const getSetting = vi.fn()

beforeEach(() => {
  setSetting.mockReset().mockResolvedValue(undefined)
  getSettings.mockReset().mockResolvedValue({ theme: 'dark', rootPath: '/x' })
  getSetting.mockReset().mockResolvedValue('dark')
  Object.defineProperty(window, 'api', {
    value: { setSetting, getSettings, getSetting },
    writable: true,
    configurable: true
  })
})

describe('useSetSetting', () => {
  it('invalidates settings.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useSetSetting())

    act(() => {
      result.current.mutate({ key: 'theme', value: 'dark' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(setSetting).toHaveBeenCalledWith('theme', 'dark')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.settings.all })
  })
})

describe('useSettings', () => {
  it('queries window.api.getSettings and surfaces the result', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getSettings).toHaveBeenCalled()
    expect(result.current.data).toEqual({ theme: 'dark', rootPath: '/x' })
  })
})

describe('useSetting', () => {
  it('queries window.api.getSetting with the supplied key', async () => {
    const { result } = renderHook(() => useSetting('theme'), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getSetting).toHaveBeenCalledWith('theme')
    expect(result.current.data).toBe('dark')
  })
})
