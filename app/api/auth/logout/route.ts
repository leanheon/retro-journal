import { cookies } from "next/headers";
import { ADMIN_COOKIE, sessionCookie, sha256 } from "../../../lib/auth";
import { env } from "../../../lib/env";

export async function POST(request: Request) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  try {
    if (token && /^[a-f0-9]{64}$/.test(token) && env.DB) {
      await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(request, "", 0) } });
  } catch {
    return Response.json({ error: "로그아웃하지 못했습니다. 다시 시도해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
