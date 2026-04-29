CREATE TABLE `collection_cuts` (
	`collection_id` text NOT NULL,
	`cut_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`collection_id`, `cut_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cut_id`) REFERENCES `cuts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_collection_cuts_position` ON `collection_cuts` (`collection_id`,`position`);--> statement-breakpoint
CREATE TABLE `collection_videos` (
	`collection_id` text NOT NULL,
	`video_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`collection_id`, `video_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_collection_videos_position` ON `collection_videos` (`collection_id`,`position`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'manual' NOT NULL,
	`smart_query` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_collections_updated_at` ON `collections` (`updated_at`);