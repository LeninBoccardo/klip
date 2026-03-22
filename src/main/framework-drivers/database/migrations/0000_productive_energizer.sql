CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`changes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_entity` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `creators` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_name` text NOT NULL,
	`name` text NOT NULL,
	`profile_image_path` text,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creators_folder_name_unique` ON `creators` (`folder_name`);--> statement-breakpoint
CREATE INDEX `idx_creators_status` ON `creators` (`status`);--> statement-breakpoint
CREATE TABLE `cuts` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`video_id` text,
	`title` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`start_timestamp` real,
	`end_timestamp` real,
	`duration` integer,
	`resolution` text,
	`file_size` integer,
	`file_path` text NOT NULL,
	`thumbnail_path` text,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_cuts_creator_id` ON `cuts` (`creator_id`);--> statement-breakpoint
CREATE INDEX `idx_cuts_video_id` ON `cuts` (`video_id`);--> statement-breakpoint
CREATE INDEX `idx_cuts_status` ON `cuts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_cuts_status_created` ON `cuts` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`error` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operations_status` ON `operations` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`duration` integer,
	`resolution` text,
	`file_size` integer,
	`file_path` text NOT NULL,
	`thumbnail_path` text,
	`download_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_videos_creator_id` ON `videos` (`creator_id`);--> statement-breakpoint
CREATE INDEX `idx_videos_status` ON `videos` (`status`);--> statement-breakpoint
CREATE INDEX `idx_videos_status_created` ON `videos` (`status`,`created_at`);