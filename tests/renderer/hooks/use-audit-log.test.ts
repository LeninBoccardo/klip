import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAuditLogRecent, useAuditLogByEntity } from '@/hooks/use-audit-log'
import { createQueryWrapper } from '../helpers/test-utils'

const getAuditLogRecent = vi.fn()
const getAuditLogByEntity = vi.fn()

beforeEach(() => {
  getAuditLogRecent.mockReset().mockResolvedValue([])
  getAuditLogByEntity.mockReset().mockResolvedValue([])
  Object.defineProperty(window, 'api', {
    value: { getAuditLogRecent, getAuditLogByEntity },
    writable: true,
    configurable: true
  })
})

describe('useAuditLogRecent', () => {
  it('forwards the limit argument to window.api.getAuditLogRecent', async () => {
    const { result } = renderHook(() => useAuditLogRecent(10), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getAuditLogRecent).toHaveBeenCalledWith(10)
  })

  it('uses the default limit (20) when none is supplied', async () => {
    const { result } = renderHook(() => useAuditLogRecent(), { wrapper: createQueryWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getAuditLogRecent).toHaveBeenCalledWith(20)
  })
})

describe('useAuditLogByEntity', () => {
  it('queries when both args are non-empty', async () => {
    const { result } = renderHook(() => useAuditLogByEntity('video', 'v-1'), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(getAuditLogByEntity).toHaveBeenCalledWith('video', 'v-1')
  })

  it('stays disabled when entityType is empty', async () => {
    const { result } = renderHook(() => useAuditLogByEntity('', 'v-1'), {
      wrapper: createQueryWrapper()
    })
    // A disabled query stays in `pending` indefinitely; no fetch fires.
    expect(result.current.isFetching).toBe(false)
    expect(getAuditLogByEntity).not.toHaveBeenCalled()
  })
})
