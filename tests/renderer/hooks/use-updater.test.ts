import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useUpdaterStatus, useCheckForUpdates, useInstallUpdate } from '@/hooks/use-updater'
import { queryKeys } from '@/lib/query-keys'
import { createQueryWrapper, createTestQueryClient } from '../helpers/test-utils'
import type { UpdaterStatus } from '@shared/types'
import { QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// `useUpdaterStatus` is unusual: it owns both a useQuery (initial fetch) AND a
// listener that pushes events into the cache via setQueryData. Failure modes:
//   - Listener never unsubscribes → leaked listeners across mounts.
//   - Listener writes to the wrong key → push events visible to nobody.
//   - Initial query never runs → toast watcher never sees the 'ready' state.

const onUpdaterStatusMock = vi.fn<[handler: (e: unknown, d: UpdaterStatus) => void], () => void>()
const getUpdaterStatusMock = vi.fn<[], Promise<UpdaterStatus>>()
const checkForUpdatesMock = vi.fn<[], Promise<UpdaterStatus>>()
const installUpdateMock = vi.fn<[], Promise<void>>()

beforeEach(() => {
  onUpdaterStatusMock.mockReset()
  getUpdaterStatusMock.mockReset()
  checkForUpdatesMock.mockReset()
  installUpdateMock.mockReset()
  Object.defineProperty(window, 'api', {
    value: {
      onUpdaterStatus: onUpdaterStatusMock,
      getUpdaterStatus: getUpdaterStatusMock,
      checkForUpdates: checkForUpdatesMock,
      installUpdate: installUpdateMock
    },
    writable: true,
    configurable: true
  })
})

describe('useUpdaterStatus', () => {
  it('runs the query against window.api.getUpdaterStatus', async () => {
    const status: UpdaterStatus = { state: 'idle', currentVersion: '0.0.0', newVersion: null }
    getUpdaterStatusMock.mockResolvedValue(status)
    const unsubscribe = vi.fn()
    onUpdaterStatusMock.mockReturnValue(unsubscribe)

    const { result } = renderHook(() => useUpdaterStatus(), { wrapper: createQueryWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(status))
    expect(getUpdaterStatusMock).toHaveBeenCalledTimes(1)
  })

  it('subscribes on mount and unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    onUpdaterStatusMock.mockReturnValue(unsubscribe)
    getUpdaterStatusMock.mockResolvedValue({
      state: 'idle',
      currentVersion: '0.0.0',
      newVersion: null
    })

    const { unmount } = renderHook(() => useUpdaterStatus(), { wrapper: createQueryWrapper() })

    expect(onUpdaterStatusMock).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('writes pushed status payloads into the updater cache key', async () => {
    onUpdaterStatusMock.mockReturnValue(() => undefined)
    getUpdaterStatusMock.mockResolvedValue({
      state: 'idle',
      currentVersion: '1.0.0',
      newVersion: null
    })

    // Use an explicit QueryClient so we can read the cache directly and
    // assert the key the listener wrote to.
    const qc = createTestQueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    renderHook(() => useUpdaterStatus(), { wrapper })

    await waitFor(() => expect(getUpdaterStatusMock).toHaveBeenCalled())

    const handler = onUpdaterStatusMock.mock.calls[0][0]
    const pushed: UpdaterStatus = {
      state: 'ready',
      currentVersion: '1.0.0',
      newVersion: '1.1.0'
    }
    act(() => handler(null, pushed))

    expect(qc.getQueryData(queryKeys.updater.status)).toEqual(pushed)
  })
})

describe('useCheckForUpdates', () => {
  it('invokes window.api.checkForUpdates and returns its result', async () => {
    const status: UpdaterStatus = {
      state: 'available',
      currentVersion: '1.0.0',
      newVersion: '1.1.0'
    }
    checkForUpdatesMock.mockResolvedValue(status)

    const { result } = renderHook(() => useCheckForUpdates(), { wrapper: createQueryWrapper() })

    await act(async () => {
      const out = await result.current.mutateAsync()
      expect(out).toEqual(status)
    })
    expect(checkForUpdatesMock).toHaveBeenCalledTimes(1)
  })
})

describe('useInstallUpdate', () => {
  it('invokes window.api.installUpdate', async () => {
    installUpdateMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => useInstallUpdate(), { wrapper: createQueryWrapper() })

    await act(async () => {
      await result.current.mutateAsync()
    })
    expect(installUpdateMock).toHaveBeenCalledTimes(1)
  })
})
