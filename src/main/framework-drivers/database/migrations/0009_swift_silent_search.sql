ALTER TABLE `videos` ADD `transcript_text` text;--> statement-breakpoint
CREATE VIRTUAL TABLE `videos_fts` USING fts5(
  video_id UNINDEXED,
  title,
  transcript_text,
  tokenize = 'unicode61 remove_diacritics 2'
);--> statement-breakpoint
CREATE TRIGGER `videos_fts_after_insert` AFTER INSERT ON `videos` BEGIN
  INSERT INTO `videos_fts` (video_id, title, transcript_text)
  VALUES (NEW.id, NEW.title, COALESCE(NEW.transcript_text, ''));
END;--> statement-breakpoint
CREATE TRIGGER `videos_fts_after_update` AFTER UPDATE OF title, transcript_text ON `videos` BEGIN
  DELETE FROM `videos_fts` WHERE video_id = OLD.id;
  INSERT INTO `videos_fts` (video_id, title, transcript_text)
  VALUES (NEW.id, NEW.title, COALESCE(NEW.transcript_text, ''));
END;--> statement-breakpoint
CREATE TRIGGER `videos_fts_after_delete` AFTER DELETE ON `videos` BEGIN
  DELETE FROM `videos_fts` WHERE video_id = OLD.id;
END;--> statement-breakpoint
INSERT INTO `videos_fts` (video_id, title, transcript_text)
  SELECT id, title, COALESCE(transcript_text, '') FROM `videos`;
