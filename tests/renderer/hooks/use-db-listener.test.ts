import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useDbListener } from '@/hooks/use-db-listener'
import { queryKeys } from '@/lib/query-keys'
import type { DbUpdatedPayload } from '@shared/types'

type DbCallback = (event: unknown, data: DbUpdatedPayload) => void

const onDbUpdated = vi.fn()
let lastCallback: DbCallback | null = null

beforeEach(() => {
  lastCallback = null
  onDbUpdated.mockReset().mockImplementation((callback: DbCallback) => {
    lastCallback = callback
    return () => {}
  })
  Object.defineProperty(window, 'api', {
    value: { onDbUpdated },
    writable: true,
    configurable: true
  })
})

function setup(): {
  qc: QueryClient
  invalidateSpy: ReturnType<typeof vi.spyOn>
  emit: (data: DbUpdatedPayload) => void
} {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  renderHook(() => useDbListener(), { wrapper })

  if (!lastCallback) throw new Error('Listener was not registered')
  const cb = lastCallback
  return {
    qc,
    invalidateSpy,
    emit: (data: DbUpdatedPayload) => cb({}, data)
  }
}

describe('useDbListener', () => {
  it("treats a missing scope as 'all' and invalidates every tree", () => {
    const { invalidateSpy, emit } = setup()
    // Cast covers legacy callers that may still pass an empty payload during
    // the S13 migration; the hook must handle it without throwing.
    emit(undefined as unknown as DbUpdatedPayload)

    const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(calls).toContainEqual(queryKeys.creators.all)
    expect(calls).toContainEqual(queryKeys.videos.all)
    expect(calls).toContainEqual(queryKeys.cuts.all)
    expect(calls).toContainEqual(queryKeys.tags.all)
    expect(calls).toContainEqual(queryKeys.search.all)
    expect(calls).toContainEqual(queryKeys.settings.all)
    expect(calls).toContainEqual(queryKeys.auditLog.all)
    expect(calls).toContainEqual(queryKeys.operations.all)
  })

  it('only invalidates videos+tags+search when scope=videos', () => {
    const { invalidateSpy, emit } = setup()
    emit({ scope: ['videos'] })

    const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(calls).toContainEqual(queryKeys.videos.all)
    expect(calls).toContainEqual(queryKeys.tags.all)
    expect(calls).toContainEqual(queryKeys.search.all)
    // Not invalidated: creators/cuts trees and the cross-cutting (settings/audit/ops) trees.
    expect(calls).not.toContainEqual(queryKeys.creators.all)
    expect(calls).not.toContainEqual(queryKeys.cuts.all)
    expect(calls).not.toContainEqual(queryKeys.settings.all)
    expect(calls).not.toContainEqual(queryKeys.auditLog.all)
  })

  it('invalidates cuts+tags+search when scope=cuts (no videos tree)', () => {
    const { invalidateSpy, emit } = setup()
    emit({ scope: ['cuts'] })

    const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(calls).toContainEqual(queryKeys.cuts.all)
    expect(calls).toContainEqual(queryKeys.tags.all)
    expect(calls).toContainEqual(queryKeys.search.all)
    expect(calls).not.toContainEqual(queryKeys.videos.all)
  })

  it('invalidates creators+search but not tags when scope=creators', () => {
    const { invalidateSpy, emit } = setup()
    emit({ scope: ['creators'] })

    const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(calls).toContainEqual(queryKeys.creators.all)
    expect(calls).toContainEqual(queryKeys.search.all)
    // Tag aggregation only depends on videos/cuts — creators alone shouldn't refresh tags.
    expect(calls).not.toContainEqual(queryKeys.tags.all)
  })

  it('does not refetch settings/audit/operations on a targeted scope push', () => {
    const { invalidateSpy, emit } = setup()
    emit({ scope: ['videos', 'cuts'] })

    const calls = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(calls).not.toContainEqual(queryKeys.settings.all)
    expect(calls).not.toContainEqual(queryKeys.auditLog.all)
    expect(calls).not.toContainEqual(queryKeys.operations.all)
  })
})
