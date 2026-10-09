import { requireBlogOwner } from "../../lib/auth";
import { databaseErrorMessage, seedDefaultPosts } from "../../lib/db";
import { jsonError, noStoreHeaders, sameOriginError } from "../../lib/http";

/**
 * Explicit, owner-only bootstrap. The database batch uses slug conflicts as
 * its idempotency key, so retrying this request never duplicates entries.
 */
export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  try {
    const posts = await seedDefaultPosts();
    return Response.json({ posts, seeded: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(databaseErrorMessage(error), 500);
  }
}
