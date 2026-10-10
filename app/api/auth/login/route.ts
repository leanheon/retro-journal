import { cookies } from "next/headers";
import { ADMIN_COOKIE, SESSION_SECONDS, hex, passwordIsConfigured, passwordVersion, sessionCookie, sha256, verifyAdminPassword } from "../../../lib/auth";
import { env } from "../../../lib/env";
import { sameOriginError } from "../../../lib/http";

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;

function error(message: string, status: number, extraHeaders: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  if (request.headers.get("sec-fetch-site") === "cross-site") return error("같은 사이트에서 로그인해 주세요.", 403);
  if (!passwordIsConfigured()) return error("관리자 비밀번호가 아직 설정되지 않았습니다.", 503);
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && url.protocol !== "https:") return error("보안 연결에서 로그인해 주세요.", 400);
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
  // CF supplies this header at the edge. Local preview ignores caller-supplied IP headers.
  const clientKey = await sha256(local ? "loopback" : (request.headers.get("cf-connecting-ip") ?? "unknown").slice(0, 64));
  try {
    const attempt = await env.DB!.prepare(`
      INSERT INTO admin_login_attempts (client_key, window_started, attempts) VALUES (?, ?, 1)
      ON CONFLICT(client_key) DO UPDATE SET
        attempts = CASE WHEN window_started <= ? THEN 1 ELSE attempts + 1 END,
        window_started = CASE WHEN window_started <= ? THEN excluded.window_started ELSE window_started END
      RETURNING attempts, window_started
    `).bind(clientKey, now, now - WINDOW_SECONDS, now - WINDOW_SECONDS).first<{ attempts: number; window_started: number }>();
    if (!attempt || attempt.attempts > MAX_ATTEMPTS) {
      const remaining = Math.max(1, (attempt?.window_started ?? now) + WINDOW_SECONDS - now);
      return error("로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.", 429, { "Retry-After": String(remaining) });
    }
    if (!await verifyAdminPassword(input.password)) return error("비밀번호가 맞지 않습니다.", 401);

    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const version = await passwordVersion();
    const previousToken = (await cookies()).get(ADMIN_COOKIE)?.value;
    const statements = [
      env.DB!.prepare("DELETE FROM admin_login_attempts WHERE client_key = ? OR window_started <= ?").bind(clientKey, now - WINDOW_SECONDS),
      env.DB!.prepare("DELETE FROM admin_sessions WHERE expires_at <= ? OR password_version != ?").bind(now, version),
      env.DB!.prepare("INSERT INTO admin_sessions (token_hash, password_version, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), version, now + SESSION_SECONDS),
    ];
    if (previousToken && /^[a-f0-9]{64}$/.test(previousToken)) statements.push(env.DB!.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(previousToken)));
    await env.DB!.batch(statements);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(request, token) } });
  } catch {
    return error("로그인 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.", 503);
  }
}
