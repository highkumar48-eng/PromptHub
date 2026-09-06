CREATE TABLE `creators` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL UNIQUE,
  `handle` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE TABLE `prompts` (
  `id` text PRIMARY KEY NOT NULL,
  `creator_id` text NOT NULL REFERENCES `creators`(`id`),
  `keyword` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `status` text NOT NULL DEFAULT 'draft',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `idx_prompts_creator_keyword` ON `prompts` (`creator_id`,`keyword`);
CREATE INDEX `idx_prompts_public_lookup` ON `prompts` (`creator_id`,`keyword`,`status`);
