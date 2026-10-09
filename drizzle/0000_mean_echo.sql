CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '일상' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`cover` text DEFAULT 'stripes' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text DEFAULT '여백 기록실' NOT NULL,
	`author` text DEFAULT '김지헌' NOT NULL,
	`description` text DEFAULT '생각과 취향, 만드는 과정을 천천히 기록합니다.' NOT NULL,
	`bio` text DEFAULT '기록하고 만들며 오래 남을 장면을 모읍니다.' NOT NULL,
	`welcome_hidden` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
