import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ── Core entity tables ──

export const creators = sqliteTable(
  'creators',
  {
    id: text('id').primaryKey(),
    folderName: text('folder_name').notNull().unique(),
    name: text('name').notNull(),
    profileImagePath: text('profile_image_path'),
    youtubeChannelId: text('youtube_channel_id'),
    youtubeChannelUrl: text('youtube_channel_url'),
    subscriberCount: integer('subscriber_count'),
    avatarUrl: text('avatar_url'),
    notes: text('notes'),
    tags: text('tags').notNull().default('[]'),
    status: text('status').notNull().default('active'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_creators_status').on(table.status),
    // Partial UNIQUE: prevents two creators from claiming the same YouTube
    // channel id (the find→insert in RegisterCreator is otherwise racy under
    // concurrent calls), while allowing multiple manual creators with no
    // channel id (NULL). Acts as the source-of-truth uniqueness guard;
    // RegisterCreator catches the constraint violation and translates it to
    // CreatorAlreadyRegisteredError so the race loser sees the same typed
    // error as a pre-check loser.
    uniqueIndex('idx_creators_yt_channel_id_unique')
      .on(table.youtubeChannelId)
      .where(sql`youtube_channel_id IS NOT NULL`)
  ]
)

export const videos = sqliteTable(
  'videos',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    url: text('url'),
    duration: integer('duration'),
    resolution: text('resolution'),
    fileSize: integer('file_size'),
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    downloadDate: text('download_date'),
    probeStatus: text('probe_status').notNull().default('pending'),
    viewCount: integer('view_count'),
    likeCount: integer('like_count'),
    dislikeCount: integer('dislike_count'),
    commentCount: integer('comment_count'),
    category: text('category'),
    tags: text('tags').notNull().default('[]'),
    uploadDate: text('upload_date'),
    description: text('description'),
    isShort: integer('is_short', { mode: 'boolean' }).notNull().default(false),
    transcriptPath: text('transcript_path'),
    transcriptText: text('transcript_text'),
    detailFetchedAt: text('detail_fetched_at'),
    status: text('status').notNull().default('active'),
    deletedAt: text('deleted_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_videos_creator_id').on(table.creatorId),
    index('idx_videos_status').on(table.status),
    index('idx_videos_status_created').on(table.status, table.createdAt),
    index('idx_videos_detail_fetched').on(table.detailFetchedAt),
    index('idx_videos_probe_status').on(table.probeStatus)
  ]
)

export const cuts = sqliteTable(
  'cuts',
  {
    id: text('id').primaryKey(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    videoId: text('video_id').references(() => videos.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    tags: text('tags').notNull().default('[]'),
    startTimestamp: real('start_timestamp'),
    endTimestamp: real('end_timestamp'),
    duration: integer('duration'),
    resolution: text('resolution'),
    fileSize: integer('file_size'),
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    probeStatus: text('probe_status').notNull().default('pending'),
    status: text('status').notNull().default('active'),
    deletedAt: text('deleted_at'),
    // Serialised `EditRecipe` for cuts produced by the in-app editor.
    // Null for sideloaded cuts (folder-discovered via reconcile). Lets v2
    // re-open editor-created cuts and query "find cuts that used X mode" as
    // SQL instead of a JSON-walk over every cut-data.json on disk.
    editRecipeJson: text('edit_recipe_json'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_cuts_creator_id').on(table.creatorId),
    index('idx_cuts_video_id').on(table.videoId),
    index('idx_cuts_status').on(table.status),
    index('idx_cuts_status_created').on(table.status, table.createdAt),
    index('idx_cuts_probe_status').on(table.probeStatus)
  ]
)

// ── App configuration ──

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`)
})

// ── Persistent operation saga log ──

export const operations = sqliteTable(
  'operations',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status').notNull().default('pending'),
    payload: text('payload').notNull().default('{}'),
    error: text('error'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_operations_status').on(table.status)]
)

// ── Collections / playlists ──
//
// Two join tables (rather than a polymorphic `collection_items`) so SQLite's
// FK CASCADE handles cleanup when a parent video / cut / collection is hard-
// deleted. The renderer/use cases enforce a unified `position` invariant —
// across the union of `collection_videos` and `collection_cuts` for a given
// collection, positions are unique. SQLite cannot express that as a DB
// constraint, so the invariant lives in the use case layer. Positions stay
// unique but may be sparse (RemoveFromCollection leaves gaps); `getItems` reads
// them verbatim ordered by position — there is no renumber-on-read. Only
// `reorderItems` densifies, on write.
//
// AUDIT-2026-05-02 (deferred): a deferred UNIQUE on (collection_id, position)
// across the union would close the gap if a future raw-SQL writer (CLI,
// external migration) violated the invariant. SQLite's deferred-constraint
// support across two tables is awkward (no cross-table CHECK), and the
// two-phase shift in `reorderItems` covers every realistic write path through
// the app. Revisit if a multi-process writer is ever introduced.

export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    // 'manual' for v1; 'smart' reserved for a future smart-query collection
    // type (saved tag/title queries that materialise on read).
    kind: text('kind').notNull().default('manual'),
    smartQuery: text('smart_query'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_collections_updated_at').on(table.updatedAt)]
)

export const collectionVideos = sqliteTable(
  'collection_videos',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: text('added_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.videoId] }),
    index('idx_collection_videos_position').on(table.collectionId, table.position),
    // FK reverse-lookup index — without it "which collections contain video X?"
    // and the FK CASCADE on videos.id full-scan this join table.
    index('idx_collection_videos_video_id').on(table.videoId)
  ]
)

export const collectionCuts = sqliteTable(
  'collection_cuts',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    cutId: text('cut_id')
      .notNull()
      .references(() => cuts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: text('added_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.cutId] }),
    index('idx_collection_cuts_position').on(table.collectionId, table.position),
    // FK reverse-lookup index — see comment on collection_videos above.
    index('idx_collection_cuts_cut_id').on(table.cutId)
  ]
)

// ── Audit trail ──

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    changes: text('changes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_audit_log_entity').on(table.entityType, table.entityId),
    index('idx_audit_log_created').on(table.createdAt)
  ]
)

// ── Finished downloads ledger ──
//
// Persistent record of every completed download attempt — both successes (a
// new Video row was upserted) and errors (yt-dlp failed, network blip, the
// URL was a duplicate, etc.). Survives app restart so the Downloads page
// can show a long-running history with retry buttons on the failures.
//
// We don't piggyback on audit_log because it only models entity mutations
// — an error never produces a Video row to audit. Keeping a dedicated
// ledger also lets us index `finished_at DESC` for the always-most-recent
// query the UI runs.
export const downloadHistory = sqliteTable(
  'download_history',
  {
    id: text('id').primaryKey(),
    youtubeUrl: text('youtube_url').notNull(),
    // Soft FK to videos.id (no `references()` because we want history rows to
    // survive when the user deletes the video; ListDownloadHistory filters
    // out rows whose video no longer exists on read instead).
    videoId: text('video_id'),
    videoTitle: text('video_title'),
    thumbnailUrl: text('thumbnail_url'),
    creatorFolderName: text('creator_folder_name'),
    // 'success' | 'error' — narrow union enforced at the use-case layer.
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    errorRetryable: integer('error_retryable', { mode: 'boolean' }).notNull().default(true),
    finishedAt: text('finished_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_download_history_finished_at').on(table.finishedAt)]
)
