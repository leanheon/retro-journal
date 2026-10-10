import { getAdminUser } from "../../lib/auth";
import { env } from "../../lib/env";
import { getPosts } from "../../lib/db";
import { UPLOADED_IMAGE_KEY_PATTERN } from "../../lib/validation";

const KEY_PATTERN = UPLOADED_IMAGE_KEY_PATTERN;

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

type RouteContext = { params: Promise<{ key: string }> };

function missing(): Response {
  return new Response("Not found", { status: 404 });
}

function mediaIsReferenced(key: string, bodies: string[]): boolean {
  const marker = `/media/${key}`;
  return bodies.some((body) => body.includes(marker));
}

function mediaIsCover(key: string, coverImages: Array<string | null>): boolean {
  const marker = `/media/${key}`;
  return coverImages.some((coverImage) => coverImage === marker);
}

export async function GET(request: Request, context: RouteContext) {
  const { key } = await context.params;
  if (!KEY_PATTERN.test(key)) return missing();

  const bucket = env.BUCKET;
  if (!bucket) return missing();

  let owner = false;
  try {
    owner = Boolean(await getAdminUser());
  } catch {
    owner = false;
  }

  if (!owner) {
    try {
      const publishedPosts = await getPosts();
      if (
        !mediaIsReferenced(key, publishedPosts.map((post) => post.body)) &&
        !mediaIsCover(key, publishedPosts.map((post) => post.coverImage))
      ) return missing();
    } catch {
      return missing();
    }
  }

  const object = await bucket.get(key);
  if (!object) return missing();

  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (object.size >= 0) headers.set("Content-Length", String(object.size));
  return new Response(object.body, { headers });
}
