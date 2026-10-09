import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Blog entries are deliberately stored as plain text. Markdown is parsed into
 * React nodes at the edge, so post content never needs to be inserted as HTML.
 */
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  body: text("body").notNull().default(""),
  category: text("category").notNull().default("일상"),
  tags: text("tags").notNull().default("[]"),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  cover: text("cover").notNull().default("stripes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  publishedAt: text("published_at"),
});

/**
 * A single settings row (id = 1) is used for the small amount of site-wide
 * copy. welcomeHidden is internal state that prevents the built-in welcome
 * card from returning after an owner deliberately removes all posts.
 */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  title: text("title").notNull().default("여백 기록실"),
  author: text("author").notNull().default("김지헌"),
  description: text("description").notNull().default("생각과 취향, 만드는 과정을 천천히 기록합니다."),
  bio: text("bio").notNull().default("기록하고 만들며 오래 남을 장면을 모읍니다."),
  welcomeHidden: integer("welcome_hidden", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type PostRow = typeof posts.$inferSelect;
export type NewPostRow = typeof posts.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;
