CREATE TABLE `creator_monthly_ledger` (
  `id` text PRIMARY KEY NOT NULL,
  `creator_id` text NOT NULL REFERENCES `creators`(`id`),
  `month` text NOT NULL,
  `currency` text NOT NULL DEFAULT 'INR',
  `gross_revenue_paise` integer NOT NULL,
  `invalid_traffic_paise` integer NOT NULL DEFAULT 0,
  `tax_deductions_paise` integer NOT NULL DEFAULT 0,
  `direct_costs_paise` integer NOT NULL DEFAULT 0,
  `net_distributable_paise` integer NOT NULL,
  `creator_share_paise` integer NOT NULL,
  `platform_share_paise` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'calculated',
  `note` text,
  `payment_reference` text,
  `approved_at` text,
  `paid_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  UNIQUE (`creator_id`, `month`)
);
CREATE INDEX `idx_creator_monthly_ledger_status` ON `creator_monthly_ledger` (`status`, `month`);
