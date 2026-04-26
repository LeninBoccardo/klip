ALTER TABLE `videos` ADD `like_count` integer;--> statement-breakpoint
ALTER TABLE `videos` ADD `dislike_count` integer;--> statement-breakpoint
ALTER TABLE `videos` ADD `comment_count` integer;--> statement-breakpoint
ALTER TABLE `videos` ADD `category` text;--> statement-breakpoint
ALTER TABLE `videos` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `videos` ADD `upload_date` text;--> statement-breakpoint
ALTER TABLE `videos` ADD `description` text;--> statement-breakpoint
ALTER TABLE `videos` ADD `is_short` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `videos` ADD `transcript_path` text;--> statement-breakpoint
ALTER TABLE `videos` ADD `detail_fetched_at` text;--> statement-breakpoint
CREATE INDEX `idx_videos_detail_fetched` ON `videos` (`detail_fetched_at`);