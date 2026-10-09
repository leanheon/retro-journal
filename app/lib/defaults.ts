import type { Post, SiteSettings } from "./types";

export const DEFAULT_SETTINGS: SiteSettings = {
  title: "여백 기록실",
  author: "김지헌",
  description: "생각과 취향, 만드는 과정을 천천히 기록합니다.",
  bio: "기록하고 만들며 오래 남을 장면을 모읍니다.",
};

/**
 * A small, clearly marked first-visit entry. It is never inserted implicitly
 * and is hidden permanently after the owner creates or deletes real content.
 */
export const WELCOME_POST: Post = {
  id: "welcome",
  slug: "welcome",
  title: "여백 기록실에 오신 것을 환영합니다",
  excerpt: "생각과 취향, 만드는 과정을 천천히 기록하는 개인 블로그입니다.",
  body: `# 여백 기록실

여기는 김지헌의 개인 기록 공간입니다.

새 글을 쓰면 이 안내 글은 목록에서 사라지고, 작성한 글이 이 자리를 채웁니다. 생각, 취향, 일상, 만드는 과정을 편한 호흡으로 남겨보세요.

이 글은 블로그를 처음 열었을 때 표시하는 시작 안내입니다.`,
  category: "시작 안내",
  tags: ["시작 안내"],
  published: true,
  featured: true,
  cover: "stripes",
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
