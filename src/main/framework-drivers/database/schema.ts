import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
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
    index('idx_creators_yt_channel_id').on(table.youtubeChannelId)
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
    index('idx_videos_status_created').on(table.status, table.createdAt)
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
    index('idx_cuts_status_created').on(table.status, table.createdAt)
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
