CREATE TABLE `creator_daily_visitors` (
  `creator_id` text NOT NULL REFERENCES `creators`(`id`),
  `metric_date` text NOT NULL,
  `visitor_hash` text NOT NULL,
  PRIMARY KEY (`creator_id`, `metric_date`, `visitor_hash`)
);
CREATE INDEX `idx_creator_daily_visitors_retention` ON `creator_daily_visitors` (`metric_date`);
CREATE TABLE `creator_daily_metrics` (
  `creator_id` text NOT NULL REFERENCES `creators`(`id`),
  `metric_date` text NOT NULL,
  `unique_visitors` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`creator_id`, `metric_date`)
);
CREATE TABLE `creator_monetization` (
  `creator_id` text PRIMARY KEY NOT NULL REFERENCES `creators`(`id`),
  `status` text NOT NULL DEFAULT 'not_eligible',
  `creator_share_percent` integer NOT NULL DEFAULT 50,
  `activated_at` text,
  `paused_reason` text
);
