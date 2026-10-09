import { absoluteUrl, publicCacheHeaders } from "../lib/http";

export async function GET(request: Request) {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    `Sitemap: ${absoluteUrl("/sitemap.xml", request)}`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      ...publicCacheHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
