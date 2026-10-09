import { createPost, databaseErrorMessage, getPublicPosts, getPosts } from "../../lib/db";
import { requireBlogOwner } from "../../lib/auth";
import { publicCacheHeaders, jsonError, noStoreHeaders, sameOriginError } from "../../lib/http";
import { validatePostInput } from "../../lib/validation";
import type { PostInput } from "../../lib/types";

export async function GET() {
  try {
    return Response.json({ posts: await getPublicPosts() }, { headers: publicCacheHeaders() });
  } catch (error) {
    return jsonError(databaseErrorMessage(error), 500);
  }
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;

  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  let payload: PostInput;
  try {
    payload = (await request.json()) as PostInput;
  } catch {
    return jsonError("JSON 형식의 본문을 보내 주세요.");
  }

  const result = validatePostInput(payload);
  if (!result.ok) return jsonError(result.error);
  const data = result.value;
  if (!data.title || data.body === undefined || data.slug === undefined) {
    return jsonError("제목과 본문을 입력해 주세요.");
  }

  try {
    const existing = await getPosts({ includeDraft: true });
    if (existing.some((post) => post.slug === data.slug)) {
      return jsonError("이미 사용 중인 slug입니다. 다른 주소를 입력해 주세요.", 409);
    }

    const post = await createPost({
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt ?? "",
      body: data.body,
      category: data.category ?? "일상",
      tags: data.tags ?? [],
      published: data.published ?? false,
      featured: data.featured ?? false,
      cover: data.cover ?? "stripes",
    });
    return Response.json({ post }, { status: 201, headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique")) {
      return jsonError("이미 사용 중인 slug입니다. 다른 주소를 입력해 주세요.", 409);
    }
    return jsonError(databaseErrorMessage(error), 500);
  }
}
