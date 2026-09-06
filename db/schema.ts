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
