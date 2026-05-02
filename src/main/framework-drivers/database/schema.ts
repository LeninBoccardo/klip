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
// constraint, so the invariant lives in the use case layer (with a defensive
// renumber-on-read in `getItems`).

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
    index('idx_collection_videos_position').on(table.collectionId, table.position)
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
    index('idx_collection_cuts_position').on(table.collectionId, table.position)
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
