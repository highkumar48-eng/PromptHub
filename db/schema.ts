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
