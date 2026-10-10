ALTER TABLE `posts` ADD `cover_image` text DEFAULT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `cover_title` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `cover_tone` text DEFAULT 'newsprint' NOT NULL;