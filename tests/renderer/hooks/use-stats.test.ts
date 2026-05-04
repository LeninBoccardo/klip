import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useStorageStats, useLibraryStats } from '@/hooks/use-stats'
import { queryKeys } from '@/lib/query-keys'
import { createTestQueryClient } from '../helpers/test-utils'
import type { StorageStats, LibraryStats } from '@shared/types'

const getStorageStats = vi.fn()
const getLibraryStats = vi.fn()

beforeEach(() => {
  getStorageStats.mockReset()
  getLibraryStats.mockReset()
  Object.defineProperty(window, 'api', {
    value: { getStorageStats, getLibraryStats },
    writable: true,
    configurable: true
  })
})

const STORAGE: StorageStats = { videosBytes: 100, cutsBytes: 50, totalBytes: 150 }
const LIBRARY: LibraryStats = {
  creators: { total: 1, byStatus: { active: 1 } },
  videos: { total: 2, byStatus: { active: 2 }, transcribed: 1, totalDuration: 120, totalSize: 100 },
  cuts: { total: 0, totalDuration: 0, totalSize: 0 },
  downloadsByDay: [],
  topCreators: [],
  storage: STORAGE
}

function withQueryClient() {
  const qc = createTestQueryClient()
  return function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

describe('useStorageStats', () => {
  it('uses queryKeys.stats.storage and forwards to window.api.getStorageStats', async () => {
    getStorageStats.mockResolvedValue(STORAGE)
    const { result } = renderHook(() => useStorageStats(), { wrapper: withQueryClient() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getStorageStats).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(STORAGE)
  })

  it('keys the query under ["stats", "storage"] (load-bearing for invalidation)', () => {
    expect(queryKeys.stats.storage).toEqual(['stats', 'storage'])
  })
})

describe('useLibraryStats', () => {
  it('uses queryKeys.stats.library and forwards to window.api.getLibraryStats', async () => {
    getLibraryStats.mockResolvedValue(LIBRARY)
    const { result } = renderHook(() => useLibraryStats(), { wrapper: withQueryClient() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getLibraryStats).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(LIBRARY)
  })

  it('keys the query under ["stats", "library"]', () => {
    expect(queryKeys.stats.library).toEqual(['stats', 'library'])
  })
})
