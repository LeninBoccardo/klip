import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDateFormat } from '@/hooks/use-date-format'
import { SETTING_KEYS } from '@shared/types'
import { createQueryWrapper } from '../helpers/test-utils'

// F75 — on cold load the persisted preset is read via async IPC
// (window.api.getSetting). Until it resolves the hook must report
// `isLoading: true` so callers can render a neutral placeholder instead of
// painting a date in the fallback `'auto'` preset for one frame and then
// snapping to the persisted preset (the visible flash).

let getSetting: ReturnType<typeof vi.fn>

beforeEach(() => {
  getSetting = vi.fn()
  Object.defineProperty(window, 'api', {
    value: { getSetting },
    writable: true,
    configurable: true
  })
})

describe('useDateFormat', () => {
  it('reports isLoading=true with the default preset before the setting resolves', () => {
    // A never-resolving promise keeps the query in its initial loading state.
    getSetting.mockReturnValue(new Promise<string | null>(() => {}))

    const { result } = renderHook(() => useDateFormat(), { wrapper: createQueryWrapper() })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.format).toBe('auto')
    expect(getSetting).toHaveBeenCalledWith(SETTING_KEYS.dateFormat)
  })

  it('flips isLoading=false and adopts the persisted preset once the setting resolves', async () => {
    getSetting.mockResolvedValue('dd/MM/yyyy')

    const { result } = renderHook(() => useDateFormat(), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.format).toBe('dd/MM/yyyy')
  })

  it('formats with the persisted preset after resolution (no auto flash on the formatter)', async () => {
    getSetting.mockResolvedValue('yyyy-MM-dd')

    const { result } = renderHook(() => useDateFormat(), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Construct the date in LOCAL time (formatDate reads getDate/getMonth/
    // getFullYear, which are local): a UTC instant would shift the day in
    // negative-offset timezones and make this assertion flaky. The yyyy-MM-dd
    // preset output is then deterministic regardless of locale/timezone.
    expect(result.current.formatDate(new Date(2026, 5, 16))).toBe('2026-06-16')
  })

  it('falls back to the default preset when the stored value is not a valid preset', async () => {
    getSetting.mockResolvedValue('garbage')

    const { result } = renderHook(() => useDateFormat(), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.format).toBe('auto')
  })
})
