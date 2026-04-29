import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  useCollection,
  useCollectionItems,
  useCollectionsPaginated,
  useAddToCollection,
  useCreateCollection,
  useDeleteCollection,
  useRemoveFromCollection,
  useRenameCollection,
  useReorderCollection
} from '@/hooks/use-collections'
import { queryKeys } from '@/lib/query-keys'
import { createQueryWrapper, renderMutationHook } from '../helpers/test-utils'

const api = {
  getCollectionsPaginated: vi.fn(),
  getCollectionById: vi.fn(),
  getCollectionItems: vi.fn(),
  createCollection: vi.fn(),
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
  addToCollection: vi.fn(),
  removeFromCollection: vi.fn(),
  reorderCollection: vi.fn()
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
  api.getCollectionsPaginated.mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    pageSize: 24,
    totalPages: 0
  })
  api.getCollectionById.mockResolvedValue(null)
  api.getCollectionItems.mockResolvedValue([])
  api.createCollection.mockResolvedValue({
    id: 'new',
    name: 'New',
    description: null,
    kind: 'manual',
    itemCount: 0,
    createdAt: '',
    updatedAt: ''
  })
  api.renameCollection.mockResolvedValue({
    id: 'a',
    name: 'Renamed',
    description: null,
    kind: 'manual',
    itemCount: 0,
    createdAt: '',
    updatedAt: ''
  })
  api.deleteCollection.mockResolvedValue({ deleted: true })
  api.addToCollection.mockResolvedValue({ position: 3 })
  api.removeFromCollection.mockResolvedValue({ removed: true })
  api.reorderCollection.mockResolvedValue({ reordered: 4 })

  Object.defineProperty(window, 'api', {
    value: api,
    writable: true,
    configurable: true
  })
})

describe('useCollectionsPaginated', () => {
  it('queries with the supplied pagination params', async () => {
    const { result } = renderHook(() => useCollectionsPaginated({ page: 1, pageSize: 24 }), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getCollectionsPaginated).toHaveBeenCalledWith({ page: 1, pageSize: 24 })
  })
})

describe('useCollection / useCollectionItems', () => {
  it('queries by id when an id is supplied', async () => {
    const { result } = renderHook(() => useCollection('a'), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getCollectionById).toHaveBeenCalledWith('a')
  })

  it('does not query when id is empty', () => {
    renderHook(() => useCollection(''), { wrapper: createQueryWrapper() })
    expect(api.getCollectionById).not.toHaveBeenCalled()
  })

  it('queries items by id', async () => {
    const { result } = renderHook(() => useCollectionItems('col'), {
      wrapper: createQueryWrapper()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.getCollectionItems).toHaveBeenCalledWith('col')
  })
})

describe('mutation hooks', () => {
  it('useCreateCollection invalidates collections.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useCreateCollection())
    act(() => {
      result.current.mutate({ name: 'X' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.createCollection).toHaveBeenCalledWith({ name: 'X' })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.collections.all })
  })

  it('useRenameCollection invalidates collections.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useRenameCollection())
    act(() => {
      result.current.mutate({ id: 'a', name: 'New' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.collections.all })
  })

  it('useDeleteCollection invalidates collections.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useDeleteCollection())
    act(() => {
      result.current.mutate('a')
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.collections.all })
  })

  it('useAddToCollection invalidates collections.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useAddToCollection())
    act(() => {
      result.current.mutate({ collectionId: 'col', kind: 'video', id: 'v-1' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.collections.all })
  })

  it('useRemoveFromCollection invalidates collections.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useRemoveFromCollection())
    act(() => {
      result.current.mutate({ collectionId: 'col', kind: 'cut', id: 'cut-1' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.collections.all })
  })

  it('useReorderCollection invalidates collections.all on success', async () => {
    const { result, invalidateSpy } = renderMutationHook(() => useReorderCollection())
    act(() => {
      result.current.mutate({
        collectionId: 'col',
        items: [{ kind: 'video', id: 'v-1' }]
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.collections.all })
  })
})
