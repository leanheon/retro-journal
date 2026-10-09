import { databaseErrorMessage, getPublicPosts, getSettings } from "../lib/db";
import { absoluteUrl, publicCacheHeaders, xmlEscape } from "../lib/http";

export async function GET(request: Request) {
  try {
    const [posts, settings] = await Promise.all([getPublicPosts(), getSettings()]);
    const siteUrl = absoluteUrl("/", request);
    const items = posts
      .filter((post) => post.published)
      .map((post) => {
        const url = absoluteUrl(`/posts/${encodeURIComponent(post.slug)}`, request);
        const date = new Date(post.publishedAt ?? post.updatedAt ?? post.createdAt);
        const pubDate = Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
        return `
    <item>
      <title>${xmlEscape(post.title)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <description>${xmlEscape(post.excerpt || post.body.slice(0, 240))}</description>
      <content:encoded>${xmlEscape(post.body)}</content:encoded>
      <pubDate>${xmlEscape(pubDate)}</pubDate>
      <category>${xmlEscape(post.category)}</category>
    </item>`;
      })
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xmlEscape(settings.title)}</title>
    <link>${xmlEscape(siteUrl)}</link>
    <description>${xmlEscape(settings.description)}</description>
    <language>ko</language>${items}
  </channel>
</rss>`;
    return new Response(xml, {
      headers: {
        ...publicCacheHeaders(),
        "Content-Type": "application/rss+xml; charset=utf-8",
      },
    });
  } catch (error) {
    return Response.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}
