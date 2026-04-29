import type { PaginationParams, VideoQueryParams, CutQueryParams } from '@shared/types'

export const queryKeys = {
  creators: {
    all: ['creators'] as const,
    list: (params: PaginationParams) => ['creators', 'list', params] as const,
    detail: (id: string) => ['creators', 'detail', id] as const
  },
  videos: {
    all: ['videos'] as const,
    list: (params: VideoQueryParams) => ['videos', 'list', params] as const,
    detail: (id: string) => ['videos', 'detail', id] as const,
    transcript: (id: string) => ['videos', 'transcript', id] as const,
    comments: (id: string, maxComments: number) => ['videos', 'comments', id, maxComments] as const
  },
  cuts: {
    all: ['cuts'] as const,
    list: (params: CutQueryParams) => ['cuts', 'list', params] as const,
    detail: (id: string) => ['cuts', 'detail', id] as const,
    byTags: (tags: string[]) => ['cuts', 'byTags', tags] as const
  },
  settings: {
    all: ['settings'] as const,
    detail: (key: string) => ['settings', 'detail', key] as const
  },
  auditLog: {
    all: ['auditLog'] as const,
    byEntity: (entityType: string, entityId: string) =>
      ['auditLog', 'byEntity', entityType, entityId] as const,
    recent: (limit: number) => ['auditLog', 'recent', limit] as const
  },
  operations: {
    all: ['operations'] as const,
    detail: (id: string) => ['operations', 'detail', id] as const,
    byStatus: (status: string) => ['operations', 'byStatus', status] as const
  },
  updater: {
    status: ['updater', 'status'] as const
  },
  tags: {
    all: ['tags'] as const,
    distinct: ['tags', 'distinct'] as const
  },
  search: {
    all: ['search'] as const,
    query: (query: string, limit: number) => ['search', 'all', query, limit] as const
  },
  collections: {
    all: ['collections'] as const,
    list: (params: PaginationParams) => ['collections', 'list', params] as const,
    detail: (id: string) => ['collections', 'detail', id] as const,
    items: (id: string) => ['collections', 'items', id] as const
  }
} as const
