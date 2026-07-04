CREATE TABLE `account` (
	`access_token` text,
	`access_token_expires_at` integer,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`id_token` text,
	`password` text,
	`provider_id` text NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`scope` text,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`ip_address` text,
	`token` text NOT NULL UNIQUE,
	`updated_at` integer NOT NULL,
	`user_agent` text,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`created_at` integer NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY,
	`image` text,
	`name` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`updated_at` integer NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hymn_files` (
	`content_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`filename` text NOT NULL,
	`hymn_id` text NOT NULL,
	`id` text PRIMARY KEY,
	`object_key` text NOT NULL UNIQUE,
	`size_bytes` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_hymn_files_hymn_id_hymns_id_fk` FOREIGN KEY (`hymn_id`) REFERENCES `hymns`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `hymns` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`hymn_number` text DEFAULT '' NOT NULL,
	`id` text PRIMARY KEY,
	`last_played` text DEFAULT '' NOT NULL,
	`lyrics_markdown` text DEFAULT '' NOT NULL,
	`music_key` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`source_id` text NOT NULL,
	`times_played_last_6_months` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_hymns_source_id_hymn_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `hymn_sources`(`id`)
);
--> statement-breakpoint
CREATE TABLE `hymn_plays` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`hymn_id` text NOT NULL,
	`id` text PRIMARY KEY,
	`order_id` text NOT NULL,
	`played_on` text NOT NULL,
	CONSTRAINT `fk_hymn_plays_hymn_id_hymns_id_fk` FOREIGN KEY (`hymn_id`) REFERENCES `hymns`(`id`),
	CONSTRAINT `fk_hymn_plays_order_id_orders_of_service_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders_of_service`(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_email_deliveries` (
	`error_message` text,
	`id` text PRIMARY KEY,
	`order_id` text NOT NULL,
	`queued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text,
	`status` text DEFAULT 'Queued' NOT NULL,
	`subject` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_order_email_deliveries_order_id_orders_of_service_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders_of_service`(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_service_templates` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`service_type_id` text NOT NULL,
	`template_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_order_service_templates_service_type_id_service_types_id_fk` FOREIGN KEY (`service_type_id`) REFERENCES `service_types`(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders_of_service` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`id` text PRIMARY KEY,
	`order_json` text NOT NULL,
	`pdf_object_key` text,
	`published_at` text,
	`service_date` text NOT NULL,
	`service_type_id` text NOT NULL,
	`status` text DEFAULT 'Planning' NOT NULL,
	`template_id` text,
	`title` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_orders_of_service_service_type_id_service_types_id_fk` FOREIGN KEY (`service_type_id`) REFERENCES `service_types`(`id`),
	CONSTRAINT `fk_orders_of_service_status_service_statuses_id_fk` FOREIGN KEY (`status`) REFERENCES `service_statuses`(`id`),
	CONSTRAINT `fk_orders_of_service_template_id_order_service_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `order_service_templates`(`id`)
);
--> statement-breakpoint
CREATE TABLE `activity_types` (
	`description` text DEFAULT '' NOT NULL,
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE `hymn_sources` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE `service_statuses` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE `service_types` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_recipients` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`email` text NOT NULL UNIQUE,
	`id` text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE `team_member_teams` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`member_id` text NOT NULL,
	`team_id` text NOT NULL,
	CONSTRAINT `team_member_teams_pk` PRIMARY KEY(`team_id`, `member_id`),
	CONSTRAINT `fk_team_member_teams_member_id_team_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `team_members`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_team_member_teams_team_id_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`first_name` text NOT NULL,
	`id` text PRIMARY KEY,
	`last_name` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`parent_team_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT `fk_teams_parent_team_id_teams_id_fk` FOREIGN KEY (`parent_team_id`) REFERENCES `teams`(`id`)
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `hymn_files_hymn_idx` ON `hymn_files` (`hymn_id`);--> statement-breakpoint
CREATE INDEX `hymns_name_idx` ON `hymns` (`name`);--> statement-breakpoint
CREATE INDEX `hymns_number_idx` ON `hymns` (`hymn_number`);--> statement-breakpoint
CREATE INDEX `hymn_plays_hymn_date_idx` ON `hymn_plays` (`hymn_id`,`played_on`);--> statement-breakpoint
CREATE INDEX `order_email_deliveries_order_idx` ON `order_email_deliveries` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_service_templates_service_type_idx` ON `order_service_templates` (`service_type_id`);--> statement-breakpoint
CREATE INDEX `orders_of_service_date_idx` ON `orders_of_service` (`service_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_of_service_service_date_unique_idx` ON `orders_of_service` (`service_date`);--> statement-breakpoint
CREATE INDEX `orders_of_service_status_idx` ON `orders_of_service` (`status`);--> statement-breakpoint
CREATE INDEX `team_member_teams_member_idx` ON `team_member_teams` (`member_id`);--> statement-breakpoint
CREATE INDEX `team_members_name_idx` ON `team_members` (`last_name`,`first_name`);--> statement-breakpoint
CREATE INDEX `teams_parent_idx` ON `teams` (`parent_team_id`);