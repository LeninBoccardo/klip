CREATE TABLE `download_history` (
	`id` text PRIMARY KEY NOT NULL,
	`youtube_url` text NOT NULL,
	`video_id` text,
	`video_title` text,
	`thumbnail_url` text,
	`creator_folder_name` text,
	`status` text NOT NULL,
	`error_message` text,
	`error_retryable` integer DEFAULT true NOT NULL,
	`finished_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_download_history_finished_at` ON `download_history` (`finished_at`);