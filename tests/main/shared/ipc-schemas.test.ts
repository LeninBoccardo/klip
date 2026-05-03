import { describe, it, expect } from 'vitest'
import { ipcSchemas } from '@shared/ipc-schemas'
import type { InvokeChannel } from '@shared/ipc-contract'

// `ipc-schemas` is the runtime defense against renderer-XSS-driven payloads —
// the file's own docblock describes the threat model. The compile-time
// `satisfies Record<InvokeChannel, …>` guards channel coverage; this test
// pins the actual runtime behavior of every schema with at least one accept
// and one reject case where reject is meaningful (channels that take `[]`
// only have an accept case).

// Each row: a representative valid payload + an array of payloads that must
// reject. `reject` covers the channel-specific guard (length cap, enum, refine,
// numeric bound, missing arg, wrong type).
type Row = {
  channel: InvokeChannel
  accept: unknown[]
  reject: unknown[][]
}

const longString = (n: number): string => 'a'.repeat(n)

const validPaginationParams = { page: 1, pageSize: 50 }
const validVideoQueryParams = { ...validPaginationParams, creatorId: 'creator-1' }
const validCutQueryParams = { ...validPaginationParams, creatorId: 'creator-1' }

const validRegisterCreatorRequest = {
  channelInfo: {
    channelId: 'UC-x',
    channelName: 'Creator',
    channelUrl: null,
    uploaderUrl: null,
    subscriberCount: null,
    avatarUrl: null
  },
  displayName: 'Display',
  folderName: 'folder-name',
  notes: null,
  tags: ['a', 'b']
}

const rows: Row[] = [
  // ── Reconcile / Download / Probe ──
  { channel: 'reconcile', accept: [], reject: [['extra']] },
  { channel: 'fetch-video-info', accept: ['https://yt/x'], reject: [[42], []] },
  {
    channel: 'download-video',
    accept: ['https://yt/x', 'creator-name'],
    reject: [[42, 'creator-name'], ['url'], ['url', 'name', 'extra']]
  },
  { channel: 'cancel-download', accept: ['dl-1'], reject: [[42], []] },
  { channel: 'probe-media-file', accept: ['C:/file.mp4'], reject: [[42]] },
  { channel: 'fetch-channel-info', accept: ['https://yt/c/x'], reject: [[42]] },

  // ── Creators ──
  {
    channel: 'get-creators-paginated',
    accept: [validPaginationParams],
    reject: [
      [{ page: 0, pageSize: 50 }],
      [{ page: 1, pageSize: 1e9 }],
      [{ page: 1, pageSize: -1 }],
      [{ page: 1, pageSize: 1.5 }],
      [{}]
    ]
  },
  { channel: 'get-creator-by-id', accept: ['c-1'], reject: [[42]] },
  { channel: 'delete-creator', accept: ['c-1'], reject: [[42]] },
  { channel: 'restore-creator', accept: ['c-1'], reject: [[42]] },
  {
    channel: 'register-creator',
    accept: [validRegisterCreatorRequest],
    reject: [
      // displayName required & 1–200
      [{ ...validRegisterCreatorRequest, displayName: '' }],
      [{ ...validRegisterCreatorRequest, displayName: longString(201) }],
      // folderName required & 1–200
      [{ ...validRegisterCreatorRequest, folderName: '' }],
      [{ ...validRegisterCreatorRequest, folderName: longString(201) }],
      // notes ≤ 5000
      [{ ...validRegisterCreatorRequest, notes: longString(5001) }],
      // tags max 64
      [{ ...validRegisterCreatorRequest, tags: Array(65).fill('t') }],
      // tag length ≤ 64
      [{ ...validRegisterCreatorRequest, tags: [longString(65)] }]
    ]
  },

  // ── Videos ──
  {
    channel: 'get-videos-paginated',
    accept: [validVideoQueryParams],
    reject: [[{ page: 1, pageSize: 1e9 }]]
  },
  { channel: 'get-video-by-id', accept: ['v-1'], reject: [[42]] },
  { channel: 'delete-video', accept: ['v-1'], reject: [[42]] },
  { channel: 'restore-video', accept: ['v-1'], reject: [[42]] },
  { channel: 'fetch-video-detail', accept: ['v-1'], reject: [[42]] },
  { channel: 'enrich-all-videos', accept: [], reject: [['extra']] },
  { channel: 'get-transcript', accept: ['v-1'], reject: [[42]] },
  {
    channel: 'fetch-video-comments',
    accept: ['v-1', 200],
    reject: [['v-1', 0], ['v-1', 5001], ['v-1', 1.5], ['v-1', Infinity], [42]]
  },

  // ── Cuts ──
  { channel: 'get-cuts-paginated', accept: [validCutQueryParams], reject: [[{}]] },
  { channel: 'get-cut-by-id', accept: ['cut-1'], reject: [[42]] },
  { channel: 'get-cuts-by-tags', accept: [['a', 'b']], reject: [[42]] },
  { channel: 'delete-cut', accept: ['cut-1'], reject: [[42]] },
  { channel: 'restore-cut', accept: ['cut-1'], reject: [[42]] },

  // ── Collections ──
  { channel: 'collections-paginated', accept: [validPaginationParams], reject: [[{}]] },
  { channel: 'collection-by-id', accept: ['col-1'], reject: [[''], [42]] },
  { channel: 'collection-get-items', accept: ['col-1'], reject: [['']] },
  {
    channel: 'collection-create',
    accept: [{ name: 'My', description: null }],
    reject: [
      [{ name: '', description: null }],
      [{ name: longString(201), description: null }],
      [{ name: 'ok', description: longString(5001) }]
    ]
  },
  {
    channel: 'collection-rename',
    accept: [{ id: 'col-1', name: 'New', description: null }],
    reject: [
      [{ id: '', name: 'ok', description: null }],
      [{ id: 'col-1', name: '', description: null }],
      [{ id: 'col-1', name: longString(201), description: null }],
      [{ id: 'col-1', name: 'ok', description: longString(5001) }]
    ]
  },
  { channel: 'collection-delete', accept: ['col-1'], reject: [['']] },
  {
    channel: 'collection-add-item',
    accept: [{ collectionId: 'col-1', kind: 'video', id: 'v-1' }],
    reject: [
      [{ collectionId: '', kind: 'video', id: 'v-1' }],
      [{ collectionId: 'col-1', kind: 'invalid', id: 'v-1' }],
      [{ collectionId: 'col-1', kind: 'video', id: '' }]
    ]
  },
  {
    channel: 'collection-remove-item',
    accept: [{ collectionId: 'col-1', kind: 'cut', id: 'cut-1' }],
    reject: [[{ collectionId: 'col-1', kind: 'film', id: 'x' }]]
  },
  {
    channel: 'collection-reorder',
    accept: [{ collectionId: 'col-1', items: [{ kind: 'video', id: 'v-1' }] }],
    reject: [
      [
        {
          collectionId: 'col-1',
          items: Array.from({ length: 5001 }, (_, i) => ({ kind: 'video', id: `v-${i}` }))
        }
      ],
      [{ collectionId: 'col-1', items: [{ kind: 'invalid', id: 'v-1' }] }]
    ]
  },

  // ── Search ──
  {
    channel: 'search-all',
    accept: ['query', 50],
    reject: [
      ['query', 0],
      ['query', 101],
      ['query', 1e6]
    ]
  },

  // ── Shell ──
  {
    channel: 'open-media-externally',
    accept: ['video', 'v-1'],
    reject: [
      ['invalid', 'v-1'],
      ['video', '']
    ]
  },

  // ── Tags ──
  { channel: 'get-all-distinct-tags', accept: [], reject: [['extra']] },
  {
    channel: 'bulk-update-tags',
    accept: [{ entityKind: 'video', ids: ['v-1'], addTags: ['a'] }],
    reject: [
      // refine: both add and remove empty/missing
      [{ entityKind: 'video', ids: ['v-1'] }],
      [{ entityKind: 'video', ids: ['v-1'], addTags: [], removeTags: [] }],
      // entityKind enum
      [{ entityKind: 'creator', ids: ['v-1'], addTags: ['a'] }],
      // ids array > 5000
      [
        {
          entityKind: 'video',
          ids: Array.from({ length: 5001 }, (_, i) => `v-${i}`),
          addTags: ['a']
        }
      ],
      // tag length > 64
      [{ entityKind: 'video', ids: ['v-1'], addTags: [longString(65)] }],
      // tags array > 64
      [{ entityKind: 'video', ids: ['v-1'], addTags: Array(65).fill('t') }]
    ]
  },
  {
    channel: 'rename-tag-globally',
    accept: ['old', 'new'],
    reject: [
      ['', 'new'],
      ['old', ''],
      [longString(65), 'new'],
      ['old', longString(65)]
    ]
  },

  // ── Settings ──
  { channel: 'get-settings', accept: [], reject: [['extra']] },
  { channel: 'get-setting', accept: ['key'], reject: [[42]] },
  { channel: 'set-setting', accept: ['key', 'value'], reject: [['key'], [42, 'v']] },
  { channel: 'migrate-root', accept: ['C:/path'], reject: [[42]] },
  { channel: 'select-folder', accept: [], reject: [['extra']] },

  // ── Audit Log ──
  {
    channel: 'get-audit-log-by-entity',
    accept: ['video', 'v-1'],
    reject: [['video'], [42, 'v-1']]
  },
  {
    channel: 'get-audit-log-recent',
    accept: [100],
    reject: [[0], [10_001], [Number.MAX_SAFE_INTEGER], [1.5]]
  },

  // ── Operations ──
  { channel: 'get-operation-by-id', accept: ['op-1'], reject: [[42]] },
  { channel: 'get-operations-by-status', accept: ['pending'], reject: [[42]] },

  // ── Updater ──
  { channel: 'check-for-updates', accept: [], reject: [['extra']] },
  { channel: 'install-update', accept: [], reject: [['extra']] },
  { channel: 'get-updater-status', accept: [], reject: [['extra']] }
]

describe('ipcSchemas — every channel has an accept + reject case', () => {
  // Coverage gate: if a new channel is added to ipcSchemas without a row here,
  // the test fails — the table is the contract surface for the validation
  // boundary, not just a sample.
  it('covers every channel in ipcSchemas', () => {
    const tableChannels = new Set(rows.map((r) => r.channel))
    const schemaChannels = Object.keys(ipcSchemas) as InvokeChannel[]
    const missing = schemaChannels.filter((c) => !tableChannels.has(c))
    expect(missing).toEqual([])
    // And no rows exist for channels that don't ship in ipcSchemas (renames):
    const orphaned = [...tableChannels].filter((c) => !(c in ipcSchemas))
    expect(orphaned).toEqual([])
  })
})

describe.each(rows)('ipcSchemas[$channel]', ({ channel, accept, reject }) => {
  const schema = ipcSchemas[channel]

  it('accepts a well-formed payload', () => {
    expect(schema.safeParse(accept).success).toBe(true)
  })

  if (reject.length > 0) {
    it.each(reject.map((p, i) => ({ payload: p, idx: i })))(
      `rejects malformed payload #$idx`,
      ({ payload }) => {
        expect(schema.safeParse(payload).success).toBe(false)
      }
    )
  }
})
