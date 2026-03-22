ALTER TABLE `cuts` ADD `probe_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `videos` ADD `probe_status` text DEFAULT 'pending' NOT NULL;