import { databaseErrorMessage, getPublicPosts } from "../lib/db";
import { absoluteUrl, publicCacheHeaders, xmlEscape } from "../lib/http";

export async function GET(request: Request) {
  try {
    const posts = await getPublicPosts();
    const urls = [
      `<url><loc>${xmlEscape(absoluteUrl("/", request))}</loc></url>`,
      ...posts
        .filter((post) => post.published)
        .map(
          (post) =>
            `<url><loc>${xmlEscape(absoluteUrl(`/posts/${encodeURIComponent(post.slug)}`, request))}</loc><lastmod>${xmlEscape(post.updatedAt)}</lastmod></url>`,
        ),
    ].join("");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
    return new Response(xml, {
      headers: {
        ...publicCacheHeaders(),
        "Content-Type": "application/xml; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}
