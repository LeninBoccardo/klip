import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useOnboardingState } from '@/hooks/use-onboarding'
import { createQueryWrapper } from '../helpers/test-utils'

const setSetting = vi.fn()
const getSetting = vi.fn()

beforeEach(() => {
  setSetting.mockReset().mockResolvedValue(undefined)
  getSetting.mockReset().mockResolvedValue(null)
  Object.defineProperty(window, 'api', {
    value: { setSetting, getSetting },
    writable: true,
    configurable: true
  })
})

describe('useOnboardingState', () => {
  it('shouldShow=true when the setting is not yet stored', async () => {
    getSetting.mockResolvedValue(null)
    const { result } = renderHook(() => useOnboardingState(), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.shouldShow).toBe(true)
  })

  it('shouldShow=false when the setting is "true"', async () => {
    getSetting.mockResolvedValue('true')
    const { result } = renderHook(() => useOnboardingState(), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.shouldShow).toBe(false)
  })

  it('shouldShow=true when the setting is explicitly "false"', async () => {
    getSetting.mockResolvedValue('false')
    const { result } = renderHook(() => useOnboardingState(), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.shouldShow).toBe(true)
  })

  it('complete() flips dismissed locally and persists "true"', async () => {
    getSetting.mockResolvedValue(null)
    const { result } = renderHook(() => useOnboardingState(), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.shouldShow).toBe(true))

    act(() => result.current.complete())

    expect(result.current.shouldShow).toBe(false)
    await waitFor(() =>
      expect(setSetting).toHaveBeenCalledWith('hasCompletedOnboarding', 'true')
    )
  })

  it('replay() persists "false" so the wizard reopens', async () => {
    getSetting.mockResolvedValue('true')
    const { result } = renderHook(() => useOnboardingState(), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.shouldShow).toBe(false))

    act(() => result.current.replay())

    await waitFor(() =>
      expect(setSetting).toHaveBeenCalledWith('hasCompletedOnboarding', 'false')
    )
  })
})
