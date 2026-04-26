import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import type { CreatorDto } from '@shared/dtos'
import type { VideoDto } from '@shared/dtos'
import type { CutDto } from '@shared/dtos'
import type { DownloadProgress, VideoInfo } from '@shared/types'

/**
 * Creates a fresh QueryClient for tests with no retries and no caching.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false }
    }
  })
}

/**
 * Wrapper component providing a fresh QueryClient to children.
 */
export function createQueryWrapper() {
  const qc = createTestQueryClient()
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

/**
 * Installs a mock `window.api` with all methods as vi.fn().
 * Returns the mock object so tests can configure return values.
 */
export function mockWindowApi() {
  const api = {
    reconcile: vi.fn(),
    fetchVideoInfo: vi.fn(),
    downloadVideo: vi.fn(),
    cancelDownload: vi.fn(),
    probeMediaFile: vi.fn(),
    getCreatorsPaginated: vi.fn(),
    getCreatorById: vi.fn(),
    deleteCreator: vi.fn(),
    restoreCreator: vi.fn(),
    getVideosPaginated: vi.fn(),
    getVideoById: vi.fn(),
    deleteVideo: vi.fn(),
    restoreVideo: vi.fn(),
    fetchVideoDetail: vi.fn(),
    enrichAllVideos: vi.fn(),
    getTranscript: vi.fn(),
    getCutsPaginated: vi.fn(),
    getCutById: vi.fn(),
    getCutsByTags: vi.fn(),
    deleteCut: vi.fn(),
    restoreCut: vi.fn(),
    getSettings: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    getAuditLogByEntity: vi.fn(),
    getAuditLogRecent: vi.fn(),
    getOperationById: vi.fn(),
    getOperationsByStatus: vi.fn(),
    onDownloadProgress: vi.fn(() => vi.fn()),
    onDbUpdated: vi.fn(() => vi.fn())
  }

  Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })

  return api
}

// ── Factory helpers ──

export function makeCreatorDto(overrides: Partial<CreatorDto> = {}): CreatorDto {
  return {
    id: 'test-creator',
    folderName: 'test-creator',
    name: 'Test Creator',
    profileImagePath: null,
    youtubeChannelId: null,
    youtubeChannelUrl: null,
    subscriberCount: null,
    avatarUrl: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

export function makeVideoDto(overrides: Partial<VideoDto> = {}): VideoDto {
  return {
    id: 'test-video',
    creatorId: 'test-creator',
    title: 'Test Video',
    url: 'https://youtube.com/watch?v=abc',
    duration: 120,
    resolution: '1920x1080',
    fileSize: 50 * 1024 * 1024,
    filePath: '/videos/test.mp4',
    thumbnailPath: null,
    downloadDate: '2026-01-01T00:00:00Z',
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
    transcriptPath: null,
    detailFetchedAt: null,
    status: 'active',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

export function makeCutDto(overrides: Partial<CutDto> = {}): CutDto {
  return {
    id: 'test-cut',
    creatorId: 'test-creator',
    videoId: 'test-video',
    title: 'Test Cut',
    tags: ['funny', 'highlight'],
    startTimestamp: 10,
    endTimestamp: 30,
    duration: 20,
    resolution: '1920x1080',
    fileSize: 10 * 1024 * 1024,
    filePath: '/cuts/test.mp4',
    thumbnailPath: null,
    probeStatus: 'complete',
    status: 'active',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

export function makeDownloadProgress(overrides: Partial<DownloadProgress> = {}): DownloadProgress {
  return {
    downloadId: 'dl-1',
    url: 'https://youtube.com/watch?v=abc',
    percent: 50,
    speed: '1.2 MB/s',
    eta: '00:30',
    status: 'downloading',
    ...overrides
  }
}

export function makeVideoInfo(overrides: Partial<VideoInfo> = {}): VideoInfo {
  return {
    videoId: 'abc123',
    title: 'Test Video Title',
    channel: 'Test Channel',
    duration: 300,
    thumbnailUrl: 'https://img.youtube.com/vi/abc/0.jpg',
    description: 'A test video description',
    ...overrides
  }
}
