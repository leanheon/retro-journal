CREATE TABLE `admin_login_attempts` (
	`client_key` text PRIMARY KEY NOT NULL,
	`window_started` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`password_version` text NOT NULL,
	`expires_at` integer NOT NULL
);
