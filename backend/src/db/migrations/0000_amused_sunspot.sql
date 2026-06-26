CREATE TABLE `approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`id_card` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`room_number` text NOT NULL,
	`property_deed_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`verify_code` text,
	`code_expires_at` text,
	`notify_method` text DEFAULT 'email',
	`reviewed_by` integer,
	`reviewed_at` text,
	`remark` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_approvals_status` ON `approvals` (`status`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` integer,
	`detail` text,
	`ip` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`parent_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `configs` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` integer,
	`updated_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_no` integer NOT NULL,
	`user_id` integer NOT NULL,
	`category_id` integer,
	`type` text NOT NULL,
	`filename` text NOT NULL,
	`original_name` text NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`size_bytes` integer NOT NULL,
	`mime_type` text,
	`width` integer,
	`height` integer,
	`duration` integer,
	`latitude` real,
	`longitude` real,
	`address` text,
	`watermark_applied` integer DEFAULT 0 NOT NULL,
	`compressed` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`remark` text,
	`uploaded_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_media_user_id` ON `media` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_media_category_id` ON `media` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_media_type` ON `media` (`type`);--> statement-breakpoint
CREATE INDEX `idx_media_record_no` ON `media` (`record_no`);--> statement-breakpoint
CREATE INDEX `idx_media_uploaded_at` ON `media` (`uploaded_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text,
	`role` text DEFAULT 'owner' NOT NULL,
	`name` text NOT NULL,
	`id_card` text,
	`phone` text,
	`email` text,
	`room_number` text,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`register_method` text NOT NULL,
	`property_deed_url` text,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now','localtime')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_id_card_unique` ON `users` (`id_card`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE TABLE `whitelist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`id_card` text NOT NULL,
	`phone` text NOT NULL,
	`room` text NOT NULL,
	`remark` text,
	`created_by` integer,
	`created_at` text DEFAULT (datetime('now','localtime')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_whitelist_room` ON `whitelist` (`room`);--> statement-breakpoint
CREATE UNIQUE INDEX `whitelist_name_id_card_phone_unique` ON `whitelist` (`name`,`id_card`,`phone`);