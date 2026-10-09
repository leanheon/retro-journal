import {
  COVER_STYLES,
  POST_CATEGORIES,
  type CoverStyle,
  type PostCategory,
  type PostCategoryWithWelcome,
  type PostInput,
  type SettingsInput,
} from "./types";

export const MAX = {
  slug: 96,
  title: 160,
  excerpt: 360,
  body: 80_000,
  category: 20,
  tag: 40,
  tags: 12,
  description: 360,
  bio: 2_000,
} as const;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type ValidatedPost = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: PostCategoryWithWelcome;
  tags: string[];
  published: boolean;
  featured: boolean;
  cover: CoverStyle;
};

export type ValidatedSettings = {
  title: string;
  author: string;
  description: string;
  bio: string;
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === 1 || value === "true") return true;
  if (value === "0" || value === 0 || value === "false") return false;
  return null;
}

function limitString(
  value: unknown,
  field: string,
  max: number,
  required = false,
): ValidationResult<string> {
  const parsed = stringValue(value);
  if (parsed === null) return { ok: false, error: `${field}은 문자열이어야 합니다.` };
  if (required && !parsed) return { ok: false, error: `${field}을(를) 입력해 주세요.` };
  if (parsed.length > max) {
    return { ok: false, error: `${field}은 ${max}자 이하로 입력해 주세요.` };
  }
  return { ok: true, value: parsed };
}

function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, MAX.slug)
    .replace(/-$/u, "");
}

export function slugFromTitle(title: string): string {
  return normalizeSlug(title) || `post-${Date.now().toString(36)}`;
}

export function validateSlug(value: unknown): ValidationResult<string> {
  const result = limitString(value, "slug", MAX.slug, true);
  if (!result.ok) return result;
  const slug = normalizeSlug(result.value);
  if (!slug) return { ok: false, error: "slug은 영문, 숫자, 한글로 입력해 주세요." };
  return { ok: true, value: slug };
}

function parseTags(value: unknown): ValidationResult<string[] | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value)) return { ok: false, error: "tags는 배열이어야 합니다." };
  if (value.length > MAX.tags) {
    return { ok: false, error: `태그는 ${MAX.tags}개 이하로 입력해 주세요.` };
  }

  const tags: string[] = [];
  for (const item of value) {
    const tag = stringValue(item);
    if (tag === null || !tag) return { ok: false, error: "태그는 문자열이어야 합니다." };
    if (tag.length > MAX.tag) {
      return { ok: false, error: `각 태그는 ${MAX.tag}자 이하로 입력해 주세요.` };
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  return { ok: true, value: tags };
}

export function validatePostInput(
  input: PostInput,
  options: { partial?: boolean; allowWelcomeCategory?: boolean } = {},
): ValidationResult<Partial<ValidatedPost>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '올바른 글 데이터를 보내 주세요.' };
  const partial = options.partial ?? false;

  const title =
    input.title === undefined && partial
      ? { ok: true as const, value: undefined }
      : limitString(input.title, "제목", MAX.title, true);
  if (!title.ok) return title;
  const body =
    input.body === undefined && partial
      ? { ok: true as const, value: undefined }
      : limitString(input.body, "본문", MAX.body, true);
  if (!body.ok) return body;

  const excerpt =
    input.excerpt === undefined && partial
      ? { ok: true as const, value: undefined }
      : limitString(input.excerpt ?? "", "요약", MAX.excerpt);
  if (!excerpt.ok) return excerpt;

  const categoryValue =
    input.category === undefined && partial ? undefined : stringValue(input.category ?? "일상");
  if (categoryValue === null) {
    return { ok: false, error: "카테고리는 일상, 생각, 취향, 만들기 중 하나여야 합니다." };
  }
  if (
    categoryValue !== undefined &&
    !POST_CATEGORIES.includes(categoryValue as PostCategory) &&
    !(options.allowWelcomeCategory && categoryValue === "시작 안내")
  ) {
    return { ok: false, error: "카테고리는 일상, 생각, 취향, 만들기 중 하나여야 합니다." };
  }

  let slug: ValidationResult<string> | { ok: true; value: undefined };
  if (input.slug === undefined && partial) {
    slug = { ok: true, value: undefined };
  } else if (input.slug === undefined && title.ok && title.value !== undefined) {
    slug = { ok: true, value: slugFromTitle(title.value) };
  } else {
    slug = validateSlug(input.slug);
  }
  if (!slug.ok) return slug;

  const tags = parseTags(input.tags);
  if (!tags.ok) return tags;

  const publishedValue =
    input.published === undefined && partial ? undefined : booleanValue(input.published ?? false);
  if (publishedValue === null) {
    return { ok: false, error: "공개 여부는 true 또는 false여야 합니다." };
  }

  const featuredValue =
    input.featured === undefined && partial ? undefined : booleanValue(input.featured ?? false);
  if (featuredValue === null) {
    return { ok: false, error: "대표 글 여부는 true 또는 false여야 합니다." };
  }

  const coverValue =
    input.cover === undefined && partial ? undefined : stringValue(input.cover ?? "stripes");
  if (coverValue === null) {
    return { ok: false, error: "표지 스타일은 stripes, sun, type, landscape 중 하나여야 합니다." };
  }
  if (
    coverValue !== undefined &&
    !COVER_STYLES.includes(coverValue as CoverStyle)
  ) {
    return { ok: false, error: "표지 스타일은 stripes, sun, type, landscape 중 하나여야 합니다." };
  }

  return {
    ok: true,
    value: {
      ...(title.value === undefined ? {} : { title: title.value }),
      ...(body.value === undefined ? {} : { body: body.value }),
      ...(slug.value === undefined ? {} : { slug: slug.value }),
      ...(excerpt.value === undefined ? {} : { excerpt: excerpt.value }),
      ...(categoryValue === undefined
        ? {}
        : { category: categoryValue as PostCategoryWithWelcome }),
      ...(tags.value === undefined ? {} : { tags: tags.value }),
      ...(publishedValue === undefined ? {} : { published: publishedValue }),
      ...(featuredValue === undefined ? {} : { featured: featuredValue }),
      ...(coverValue === undefined ? {} : { cover: coverValue as CoverStyle }),
    },
  };
}

export function validateSettingsInput(
  input: SettingsInput,
  options: { partial?: boolean } = {},
): ValidationResult<ValidatedSettings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '올바른 설정 데이터를 보내 주세요.' };
  const partial = options.partial ?? false;
  const fields = [
    ["title", "사이트 이름", MAX.title],
    ["author", "작성자 이름", MAX.title],
    ["description", "사이트 설명", MAX.description],
    ["bio", "소개", MAX.bio],
  ] as const;

  const output: Partial<ValidatedSettings> = {};
  for (const [key, label, max] of fields) {
    const raw = input[key];
    if (raw === undefined && partial) continue;
    const value = limitString(raw ?? "", label, max, true);
    if (!value.ok) return value;
    output[key] = value.value;
  }

  if (!partial && Object.keys(output).length !== fields.length) {
    return { ok: false, error: "사이트 설정을 모두 입력해 주세요." };
  }

  return { ok: true, value: output as ValidatedSettings };
}

export function parseTagsFromStorage(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
