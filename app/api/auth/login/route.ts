import { cookies } from "next/headers";
import { ADMIN_COOKIE, SESSION_SECONDS, getAdminPasswordHash, hex, passwordIsConfigured, passwordVersion, sessionCookie, sha256, verifyAdminPassword } from "../../../lib/auth";
import { env } from "../../../lib/env";

function error(message: string, status: number, extraHeaders: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

export async function POST(request: Request) {
  if (!passwordIsConfigured()) return error("관리자 비밀번호가 아직 설정되지 않았습니다.", 503);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return error("로그인 요청 형식을 확인해 주세요.", 400);
  if (Number(request.headers.get("content-length") ?? "0") > 2048) return error("로그인 요청이 너무 큽니다.", 413);
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 2048) return error("로그인 요청이 너무 큽니다.", 413);
    input = JSON.parse(body);
  } catch { return error("로그인 요청을 확인해 주세요.", 400); }
  if (!input || typeof input !== "object" || !("password" in input) || typeof input.password !== "string" || !input.password || input.password.length > 256) {
    return error("비밀번호를 입력해 주세요.", 400);
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    const hash = await getAdminPasswordHash();
    if (!await verifyAdminPassword(input.password, hash)) return error("비밀번호가 맞지 않습니다.", 401);

    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const version = await passwordVersion(hash);
    const previousToken = (await cookies()).get(ADMIN_COOKIE)?.value;
    const statements = [
      env.DB!.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now),
      env.DB!.prepare("INSERT INTO admin_sessions (token_hash, password_version, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), version, now + SESSION_SECONDS),
    ];
    if (previousToken && /^[a-f0-9]{64}$/.test(previousToken)) statements.push(env.DB!.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(previousToken)));
    await env.DB!.batch(statements);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(request, token) } });
  } catch {
    return error("로그인 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.", 503);
  }
}
