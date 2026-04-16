ALTER TABLE `creators` ADD `youtube_channel_id` text;--> statement-breakpoint
ALTER TABLE `creators` ADD `youtube_channel_url` text;--> statement-breakpoint
ALTER TABLE `creators` ADD `subscriber_count` integer;--> statement-breakpoint
ALTER TABLE `creators` ADD `avatar_url` text;--> statement-breakpoint
CREATE INDEX `idx_creators_yt_channel_id` ON `creators` (`youtube_channel_id`);--> statement-breakpoint
ALTER TABLE `videos` ADD `view_count` integer;