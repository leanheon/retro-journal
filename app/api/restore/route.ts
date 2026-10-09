import { requireBlogOwner } from "../../lib/auth";
import { databaseErrorMessage, restoreBackup } from "../../lib/db";
import { jsonError, noStoreHeaders, sameOriginError } from "../../lib/http";
import { validatePostInput, validateSettingsInput } from "../../lib/validation";
import type { BackupPayload, PostInput, SettingsInput } from "../../lib/types";

const MAX_RESTORE_POSTS = 500;

function restoredDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  let payload: Partial<BackupPayload> & { settings?: SettingsInput; posts?: PostInput[] };
  try {
    payload = await request.json();
  } catch {
    return jsonError("JSON 형식의 백업 파일을 보내 주세요.");
  }
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.posts)) {
    return jsonError("백업 파일의 posts 배열이 필요합니다.");
  }
  if (payload.posts.length > MAX_RESTORE_POSTS) {
    return jsonError(`한 번에 ${MAX_RESTORE_POSTS}개 이하의 글만 복원할 수 있습니다.`);
  }
  if (!payload.settings || typeof payload.settings !== "object") {
    return jsonError("백업 파일의 settings 객체가 필요합니다.");
  }

  const settingsResult = validateSettingsInput(payload.settings, { partial: false });
  if (!settingsResult.ok) return jsonError(`설정 복원 실패: ${settingsResult.error}`);

  const now = new Date().toISOString();
  const slugs = new Set<string>();
  const restoredPosts = [];
  for (const rawPost of payload.posts) {
    if (!rawPost || typeof rawPost !== "object") {
      return jsonError("백업 파일에 올바르지 않은 글이 포함되어 있습니다.");
    }
    const result = validatePostInput(rawPost, {
      partial: false,
      allowWelcomeCategory: true,
    });
    if (!result.ok) return jsonError(`글 복원 실패: ${result.error}`);
    const post = result.value;
    if (!post.slug || !post.title || post.body === undefined) {
      return jsonError("복원할 글에는 slug, 제목, 본문이 필요합니다.");
    }
    if (slugs.has(post.slug)) {
      return jsonError(`백업 파일에 중복된 slug가 있습니다: ${post.slug}`, 409);
    }
    slugs.add(post.slug);
    restoredPosts.push({
      id: typeof rawPost.id === "number" ? rawPost.id : 0,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt ?? "",
      body: post.body,
      category: post.category ?? "일상",
      tags: post.tags ?? [],
      published: post.published ?? false,
      featured: post.featured ?? false,
      cover: post.cover ?? "stripes",
      createdAt: restoredDate(rawPost.createdAt, now),
      updatedAt: restoredDate(rawPost.updatedAt, now),
      publishedAt:
        post.published === false
          ? null
          : restoredDate(rawPost.publishedAt, now),
    });
  }

  try {
    const backup = await restoreBackup({
      settings: settingsResult.value,
      posts: restoredPosts,
    });
    return Response.json({ backup, restored: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(databaseErrorMessage(error), 500);
  }
}
