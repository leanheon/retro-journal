import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { posts, settings, type NewPostRow, type PostRow } from "../../db/schema";
import { DEFAULT_POSTS, DEFAULT_SETTINGS, WELCOME_POST } from "./defaults";
import { parseTagsFromStorage } from "./validation";
import type {
  BackupPayload,
  CoverStyle,
  Post,
  PostCategoryWithWelcome,
  SiteSettings,
} from "./types";

const SETTINGS_ID = 1;

export function toPost(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category: row.category as PostCategoryWithWelcome,
    tags: parseTagsFromStorage(row.tags),
    published: row.published,
    featured: row.featured,
    cover: row.cover as CoverStyle,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  };
}

function toSettings(row: typeof settings.$inferSelect | undefined): SiteSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    title: row.title,
    author: row.author,
    description: row.description,
    bio: row.bio,
  };
}

export function databaseErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${cause}`;
  if (
    combined.includes("no such table") ||
    combined.includes("posts") ||
    combined.includes("settings")
  ) {
    return "기록 저장소를 준비하는 중입니다. 잠시 후 다시 시도해 주세요.";
  }
  return "데이터를 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

async function readSettingsRow() {
  const db = getDb();
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .limit(1);
  return row;
}

export async function getSettings(): Promise<SiteSettings> {
  return toSettings(await readSettingsRow());
}

export async function getSettingsRow() {
  return readSettingsRow();
}

export async function getPosts(options: { includeDraft?: boolean } = {}): Promise<Post[]> {
  const db = getDb();
  const query = db
    .select()
    .from(posts)
    .orderBy(
      desc(posts.featured),
      desc(posts.publishedAt),
      desc(posts.updatedAt),
      desc(posts.id),
    );
  const rows = options.includeDraft
    ? await query
    : await query.where(eq(posts.published, true));
  return rows.map(toPost);
}

export async function getPublicPosts(): Promise<Post[]> {
  const rows = await getPosts();
  if (rows.length > 0) return rows;

  const row = await getSettingsRow();
  return row?.welcomeHidden ? [] : [WELCOME_POST];
}

export async function getPostById(
  id: number,
  options: { includeDraft?: boolean } = {},
): Promise<Post | null> {
  const db = getDb();
  const conditions = options.includeDraft
    ? eq(posts.id, id)
    : undefined;
  const rows = conditions
    ? await db.select().from(posts).where(conditions).limit(1)
    : await db
        .select()
        .from(posts)
        .where(eq(posts.id, id))
        .limit(1);
  const row = rows[0];
  return row && (options.includeDraft || row.published) ? toPost(row) : null;
}

export async function getPostBySlug(
  slug: string,
  options: { includeDraft?: boolean } = {},
): Promise<Post | null> {
  try { slug = decodeURIComponent(slug); } catch { return null; }
  const db = getDb();
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1);
  const row = rows[0];
  if (row && (options.includeDraft || row.published)) return toPost(row);
  if (row) return null;

  if (!options.includeDraft && slug === WELCOME_POST.slug) {
    const anyPosts = await db.select({ id: posts.id }).from(posts).limit(1);
    const rowSettings = await readSettingsRow();
    if (anyPosts.length === 0 && !rowSettings?.welcomeHidden) return WELCOME_POST;
  }
  return null;
}

export async function saveSettings(
  input: SiteSettings,
  options: { welcomeHidden?: boolean } = {},
): Promise<SiteSettings> {
  const db = getDb();
  const existing = await readSettingsRow();
  const now = new Date().toISOString();
  const welcomeHidden = options.welcomeHidden ?? existing?.welcomeHidden ?? false;
  const values = {
    id: SETTINGS_ID,
    title: input.title,
    author: input.author,
    description: input.description,
    bio: input.bio,
    welcomeHidden,
    updatedAt: now,
  };

  if (existing) {
    const [row] = await db
      .update(settings)
      .set(values)
      .where(eq(settings.id, SETTINGS_ID))
      .returning();
    return toSettings(row);
  }

  const [row] = await db.insert(settings).values(values).returning();
  return toSettings(row);
}

export async function setWelcomeHidden(hidden: boolean): Promise<void> {
  const current = await getSettings();
  await saveSettings(current, { welcomeHidden: hidden });
}

export async function createPost(input: {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  tags: string[];
  published: boolean;
  featured: boolean;
  cover: string;
}): Promise<Post> {
  const db = getDb();
  const now = new Date().toISOString();
  const values: NewPostRow = {
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    body: input.body,
    category: input.category,
    tags: JSON.stringify(input.tags),
    published: input.published,
    featured: input.featured,
    cover: input.cover,
    createdAt: now,
    updatedAt: now,
    publishedAt: input.published ? now : null,
  };
  const [row] = await db.insert(posts).values(values).returning();
  await setWelcomeHidden(true);
  return toPost(row);
}

export async function updatePost(
  id: number,
  input: Partial<{
    slug: string;
    title: string;
    excerpt: string;
    body: string;
    category: string;
    tags: string[];
    published: boolean;
    featured: boolean;
    cover: string;
  }>,
): Promise<Post | null> {
  const db = getDb();
  const existing = await getPostById(id, { includeDraft: true });
  if (!existing) return null;
  const now = new Date().toISOString();
  const set: Partial<typeof posts.$inferInsert> = { updatedAt: now };
  if (input.slug !== undefined) set.slug = input.slug;
  if (input.title !== undefined) set.title = input.title;
  if (input.excerpt !== undefined) set.excerpt = input.excerpt;
  if (input.body !== undefined) set.body = input.body;
  if (input.category !== undefined) set.category = input.category;
  if (input.tags !== undefined) set.tags = JSON.stringify(input.tags);
  if (input.published !== undefined) set.published = input.published;
  if (input.featured !== undefined) set.featured = input.featured;
  if (input.cover !== undefined) set.cover = input.cover;
  if (input.published !== undefined) {
    set.publishedAt = input.published ? existing.publishedAt ?? now : null;
  }
  const [row] = await db.update(posts).set(set).where(eq(posts.id, id)).returning();
  await setWelcomeHidden(true);
  return row ? toPost(row) : null;
}

export async function deletePost(id: number): Promise<boolean> {
  const db = getDb();
  const deleted = await db.delete(posts).where(eq(posts.id, id)).returning({ id: posts.id });
  if (deleted.length > 0) {
    const remaining = await db.select({ id: posts.id }).from(posts).limit(1);
    if (remaining.length === 0) await setWelcomeHidden(true);
    return true;
  }
  return false;
}

function seedRow(post: Post): NewPostRow {
  const now = new Date().toISOString();
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    category: post.category,
    tags: JSON.stringify(post.tags),
    published: post.published,
    featured: post.featured,
    cover: post.cover,
    createdAt: post.createdAt || now,
    updatedAt: post.updatedAt || now,
    publishedAt: post.publishedAt || (post.published ? now : null),
  };
}

export async function seedDefaultPosts(): Promise<Post[]> {
  const db = getDb();
  const statements = DEFAULT_POSTS.map((post) =>
    db
      .insert(posts)
      .values(seedRow(post))
      .onConflictDoNothing({ target: posts.slug }),
  );
  if (statements.length > 0) await db.batch(statements as [typeof statements[number], ...typeof statements]);
  await setWelcomeHidden(true);
  return getPosts({ includeDraft: true });
}

export async function getBackup(): Promise<BackupPayload> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    posts: await getPosts({ includeDraft: true }),
  };
}

export async function restoreBackup(
  backup: Omit<BackupPayload, "version" | "exportedAt">,
): Promise<BackupPayload> {
  const db = getDb();
  const now = new Date().toISOString();
  const statements = [
    ...backup.posts.map((post) => db.insert(posts).values(seedRow(post)).onConflictDoNothing({ target: posts.slug })),
    db
      .insert(settings)
      .values({
        id: SETTINGS_ID,
        ...backup.settings,
        welcomeHidden: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: settings.id,
        set: {
          ...backup.settings,
          welcomeHidden: true,
          updatedAt: now,
        },
      }),
  ];
  await db.batch(statements as [typeof statements[number], ...typeof statements]);
  return getBackup();
}
