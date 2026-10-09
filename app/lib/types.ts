export const POST_CATEGORIES = ["일상", "생각", "취향", "만들기"] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

// This label is reserved for the immutable first-visit welcome entry.
export const WELCOME_CATEGORY = "시작 안내" as const;
export type PostCategoryWithWelcome = PostCategory | typeof WELCOME_CATEGORY;

export const COVER_STYLES = ["stripes", "sun", "type", "landscape"] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];

export type PostId = number | "welcome";

export type Post = {
  id: PostId;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: PostCategoryWithWelcome;
  tags: string[];
  published: boolean;
  featured: boolean;
  cover: CoverStyle;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  isSample?: boolean;
};

export type SiteSettings = {
  title: string;
  author: string;
  description: string;
  bio: string;
};

export type PostInput = {
  slug?: unknown;
  title?: unknown;
  excerpt?: unknown;
  body?: unknown;
  category?: unknown;
  tags?: unknown;
  published?: unknown;
  featured?: unknown;
  cover?: unknown;
};

export type SettingsInput = {
  title?: unknown;
  author?: unknown;
  description?: unknown;
  bio?: unknown;
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  settings: SiteSettings;
  posts: Post[];
};
