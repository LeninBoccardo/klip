DROP INDEX `idx_creators_yt_channel_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_creators_yt_channel_id_unique` ON `creators` (`youtube_channel_id`) WHERE youtube_channel_id IS NOT NULL;