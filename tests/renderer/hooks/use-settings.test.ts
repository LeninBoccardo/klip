import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { useSetSetting } from '@/hooks/use-settings'
import { queryKeys } from '@/lib/query-keys'
import { renderMutationHook } from '../helpers/test-utils'

const setSetting = vi.fn()

beforeEach(() => {
  setSetting.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    value: { setSetting },
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
