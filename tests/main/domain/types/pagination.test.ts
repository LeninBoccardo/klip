import { describe, it, expect } from 'vitest'
import { paginatedResult } from '@domain/types'

describe('paginatedResult', () => {
  it('calculates totalPages correctly', () => {
    const result = paginatedResult(['a', 'b'], 10, { page: 1, pageSize: 3 })
    expect(result.totalPages).toBe(4) // ceil(10/3) = 4
  })

  it('returns at least 1 totalPages even when total is 0', () => {
    const result = paginatedResult([], 0, { page: 1, pageSize: 10 })
    expect(result.totalPages).toBe(1)
  })

  it('mirrors page and pageSize from params', () => {
    const result = paginatedResult([], 0, { page: 3, pageSize: 25 })
    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(25)
  })

  it('includes the data array as-is', () => {
    const data = [{ id: 1 }, { id: 2 }]
    const result = paginatedResult(data, 2, { page: 1, pageSize: 10 })
    expect(result.data).toBe(data) // same reference
  })
})
