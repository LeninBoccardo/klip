import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { CollectionItemList } from '@/components/features/collections/CollectionItemList'
import { usePlayerStore } from '@/hooks/use-player-store'
import { act } from '@testing-library/react'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock
}))

const api = {
  getCollectionItems: vi.fn(),
  reorderCollection: vi.fn(),
  removeFromCollection: vi.fn()
}

beforeEach(() => {
  navigateMock.mockReset()
  Object.values(api).forEach((fn) => fn.mockReset())
  api.getCollectionItems.mockResolvedValue([
    {
      kind: 'video',
      position: 0,
      addedAt: '',
      entity: {
        id: 'v-1',
        creatorId: 'c-1',
        title: 'First video',
        url: null,
        duration: null,
        resolution: null,
        fileSize: null,
        hasThumbnail: false,
        hasTranscript: false,
        downloadDate: null,
        probeStatus: 'complete',
        viewCount: null,
        likeCount: null,
        dislikeCount: null,
        commentCount: null,
        category: null,
        tags: [],
        uploadDate: null,
        description: null,
        isShort: false,
        detailFetchedAt: null,
        status: 'active',
        deletedAt: null,
        createdAt: '',
        updatedAt: ''
      }
    },
    {
      kind: 'cut',
      position: 1,
      addedAt: '',
      entity: {
        id: 'cut-1',
        creatorId: 'c-1',
        videoId: null,
        title: 'A clip',
        tags: [],
        startTimestamp: null,
        endTimestamp: null,
        duration: null,
        resolution: null,
        fileSize: null,
        hasThumbnail: false,
        probeStatus: 'complete',
        status: 'missing',
        deletedAt: null,
        createdAt: '',
        updatedAt: ''
      }
    }
  ])
  api.reorderCollection.mockResolvedValue({ reordered: 2 })
  api.removeFromCollection.mockResolvedValue({ removed: true })
  Object.defineProperty(window, 'api', {
    value: api,
    writable: true,
    configurable: true
  })
  act(() => usePlayerStore.getState().stop())
})

function renderWithProviders(ui: React.ReactElement): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('CollectionItemList', () => {
  it('renders both kinds in order with a missing-tombstone badge', async () => {
    renderWithProviders(<CollectionItemList collectionId="col" />)

    expect(await screen.findByText('First video')).toBeInTheDocument()
    expect(screen.getByText('A clip')).toBeInTheDocument()
    expect(screen.getByText('Missing')).toBeInTheDocument()
  })

  it('move-down on the first item fires reorderCollection with the swapped order', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CollectionItemList collectionId="col" />)
    await screen.findByText('First video')

    // The first row's "Move down" is the first instance.
    await user.click(screen.getAllByLabelText('Move down')[0])

    await waitFor(() =>
      expect(api.reorderCollection).toHaveBeenCalledWith({
        collectionId: 'col',
        items: [
          { kind: 'cut', id: 'cut-1' },
          { kind: 'video', id: 'v-1' }
        ]
      })
    )
  })

  it('Remove button fires removeFromCollection with the right kind+id', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CollectionItemList collectionId="col" />)
    await screen.findByText('First video')

    await user.click(screen.getAllByLabelText('Remove from collection')[0])

    await waitFor(() =>
      expect(api.removeFromCollection).toHaveBeenCalledWith({
        collectionId: 'col',
        kind: 'video',
        id: 'v-1'
      })
    )
  })

  it('clicking a playable row loads the player and navigates (videos only)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CollectionItemList collectionId="col" />)
    await screen.findByText('First video')

    await user.click(screen.getByLabelText('Play First video'))

    expect(usePlayerStore.getState().videoId).toBe('v-1')
    expect(usePlayerStore.getState().mediaKind).toBe('video')
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/videos/$videoId',
      params: { videoId: 'v-1' }
    })
  })

  it('the missing item Play button is disabled', async () => {
    renderWithProviders(<CollectionItemList collectionId="col" />)
    await screen.findByText('A clip')
    expect(screen.getByLabelText('Play A clip')).toBeDisabled()
  })

  it('renders an empty state when the collection has no items', async () => {
    api.getCollectionItems.mockResolvedValue([])
    renderWithProviders(<CollectionItemList collectionId="col" />)
    expect(await screen.findByText(/No items yet/)).toBeInTheDocument()
  })
})
