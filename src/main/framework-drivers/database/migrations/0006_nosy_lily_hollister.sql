ALTER TABLE `creators` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `creators` ADD `tags` text DEFAULT '[]' NOT NULL;