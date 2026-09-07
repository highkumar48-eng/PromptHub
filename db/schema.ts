import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const creators = sqliteTable('creators', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().unique(),
  handle: text('handle').notNull().unique(), name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});
export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey(), creatorId: text('creator_id').notNull().references(() => creators.id),
  keyword: text('keyword').notNull(), title: text('title').notNull(), body: text('body').notNull(),
  status: text('status').notNull().default('draft'), createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [uniqueIndex('idx_prompts_creator_keyword').on(table.creatorId, table.keyword)]);
export const creatorDailyVisitors = sqliteTable('creator_daily_visitors', {
  creatorId: text('creator_id').notNull().references(() => creators.id), metricDate: text('metric_date').notNull(), visitorHash: text('visitor_hash').notNull(),
});
export const creatorDailyMetrics = sqliteTable('creator_daily_metrics', {
  creatorId: text('creator_id').notNull().references(() => creators.id), metricDate: text('metric_date').notNull(), uniqueVisitors: integer('unique_visitors').notNull().default(0),
});
export const creatorMonetization = sqliteTable('creator_monetization', {
  creatorId: text('creator_id').primaryKey().references(() => creators.id), status: text('status').notNull().default('not_eligible'), creatorSharePercent: integer('creator_share_percent').notNull().default(50), activatedAt: text('activated_at'), pausedReason: text('paused_reason'),
});
export const creatorMonthlyLedger = sqliteTable('creator_monthly_ledger', {
  id: text('id').primaryKey(), creatorId: text('creator_id').notNull().references(() => creators.id), month: text('month').notNull(), currency: text('currency').notNull().default('INR'), grossRevenuePaise: integer('gross_revenue_paise').notNull(), invalidTrafficPaise: integer('invalid_traffic_paise').notNull().default(0), taxDeductionsPaise: integer('tax_deductions_paise').notNull().default(0), directCostsPaise: integer('direct_costs_paise').notNull().default(0), netDistributablePaise: integer('net_distributable_paise').notNull(), creatorSharePaise: integer('creator_share_paise').notNull(), platformSharePaise: integer('platform_share_paise').notNull(), status: text('status').notNull().default('calculated'), note: text('note'), paymentReference: text('payment_reference'), approvedAt: text('approved_at'), paidAt: text('paid_at'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
