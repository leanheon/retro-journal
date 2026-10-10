import { checkCoverImage, deletePost, databaseErrorMessage, getPostById, getPosts, updatePost } from "../../../lib/db";
import { requireBlogOwner } from "../../../lib/auth";
import { jsonError, noStoreHeaders, sameOriginError, parseNumericId } from "../../../lib/http";
import { validatePostInput } from "../../../lib/validation";
import type { PostInput } from "../../../lib/types";

type RouteContext = { params: Promise<{ id: string }> };

async function getId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  return parseNumericId(id);
}

export async function PUT(request: Request, context: RouteContext) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  const id = await getId(context);
  if (id === null) return jsonError("올바른 글 ID가 필요합니다.", 400);

  let payload: PostInput;
  try {
    payload = (await request.json()) as PostInput;
  } catch {
    return jsonError("JSON 형식의 본문을 보내 주세요.");
  }
  const result = validatePostInput(payload, { partial: true });
  if (!result.ok) return jsonError(result.error);
  if (Object.keys(result.value).length === 0) {
    return jsonError("수정할 내용을 하나 이상 입력해 주세요.");
  }

  try {
    const existing = await getPostById(id, { includeDraft: true });
    if (!existing) return jsonError("글을 찾을 수 없습니다.", 404);

    if (result.value.slug && result.value.slug !== existing.slug) {
      const posts = await getPosts({ includeDraft: true });
      if (posts.some((post) => post.id !== id && post.slug === result.value.slug)) {
        return jsonError("이미 사용 중인 slug입니다. 다른 주소를 입력해 주세요.", 409);
      }
    }

    if (result.value.coverImage !== undefined) {
      const coverCheck = await checkCoverImage(result.value.coverImage);
      if (coverCheck === "missing") {
        return jsonError("표지 이미지를 찾을 수 없습니다.", 400);
      }
      if (coverCheck === "unavailable") {
        return jsonError("표지 이미지 저장소를 확인할 수 없습니다.", 503);
      }
    }

    const post = await updatePost(id, result.value);
    if (!post) return jsonError("글을 찾을 수 없습니다.", 404);
    return Response.json({ post }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique")) {
      return jsonError("이미 사용 중인 slug입니다. 다른 주소를 입력해 주세요.", 409);
    }
    return jsonError(databaseErrorMessage(error), 500);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  const id = await getId(context);
  if (id === null) return jsonError("올바른 글 ID가 필요합니다.", 400);

  try {
    const deleted = await deletePost(id);
    if (!deleted) return jsonError("글을 찾을 수 없습니다.", 404);
    return Response.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(databaseErrorMessage(error), 500);
  }
}
