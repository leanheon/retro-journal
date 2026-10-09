import { requireBlogOwner } from "../../lib/auth";
import { databaseErrorMessage, getPosts, getSettings } from "../../lib/db";
import { jsonError, noStoreHeaders } from "../../lib/http";

export async function GET() {
  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  try {
    const [posts, settings] = await Promise.all([
      getPosts({ includeDraft: true }),
      getSettings(),
    ]);
    return Response.json({ posts, settings }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(databaseErrorMessage(error), 500);
  }
}
