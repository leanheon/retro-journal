import type { Post, SiteSettings } from "./types";

export const DEFAULT_SETTINGS: SiteSettings = {
  title: "내맘대로 살거야",
  author: "김지헌",
  description: "일상, 생각, 좋아하는 것들을 적습니다.",
  bio: "안녕하세요. 김지헌입니다. 쓰고 싶은 이야기를 여기에 남깁니다.",
};

/**
 * A small, clearly marked first-visit entry. It is never inserted implicitly
 * and is hidden permanently after the owner creates or deletes real content.
 */
export const WELCOME_POST: Post = {
  id: "welcome",
  slug: "welcome",
  title: "블로그를 열었습니다",
  excerpt: "이곳에 쓰고 싶은 이야기를 하나씩 적어 보려 합니다.",
  body: `# 첫 페이지

여기는 김지헌의 개인 기록 공간입니다.

새 글을 쓰면 이 안내 글은 목록에서 사라지고, 작성한 글이 이 자리를 채웁니다. 일상, 생각, 좋아하는 것들을 내맘대로 적어 보세요.

이 글은 블로그를 처음 열었을 때 표시하는 시작 안내입니다.`,
  category: "시작 안내",
  tags: ["시작 안내"],
  published: true,
  featured: true,
  cover: "stripes",
  coverImage: null,
  coverTitle: false,
  coverTone: "newsprint",
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
  publishedAt: "2026-10-09T00:00:00.000Z",
  isSample: true,
};

/**
 * Kept as an array so the owner can extend the explicit seed route later.
 * The public site only uses WELCOME_POST while the database is untouched.
 */
export const DEFAULT_POSTS: Post[] = [WELCOME_POST];
