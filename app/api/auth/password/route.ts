import { getAdminPasswordHash, hashAdminPassword, hex, passwordVersion, requireBlogOwner, SESSION_SECONDS, sessionCookie, sha256, verifyAdminPassword } from "../../../lib/auth";
import { env } from "../../../lib/env";
import { sameOriginError } from "../../../lib/http";

const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail("같은 사이트에서 변경해 주세요.", 403);
  try {
    const owner = await requireBlogOwner();
    if (!owner.ok) return owner.response;
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail("요청 형식을 확인해 주세요.", 400);
    if (Number(request.headers.get("content-length") ?? "0") > 4096) return fail("요청이 너무 큽니다.", 413);
    const body = await request.text();
    if (body.length > 4096) return fail("요청이 너무 큽니다.", 413);
    let input;
    try { input = JSON.parse(body); } catch { return fail("요청을 확인해 주세요.", 400); }
    if (!input || typeof input.currentPassword !== "string" || typeof input.newPassword !== "string") return fail("현재 비밀번호와 새 비밀번호를 입력해 주세요.", 400);
    if (input.newPassword.length < 8 || input.newPassword.length > 256 || /[\u0000-\u001f\u007f]/.test(input.newPassword)) return fail("새 비밀번호는 제어 문자 없이 8~256자로 입력해 주세요.", 400);
    const previousHash = await getAdminPasswordHash();
    if (!await verifyAdminPassword(input.currentPassword, previousHash)) return fail("현재 비밀번호가 맞지 않습니다.", 401);
    if (input.currentPassword === input.newPassword) return fail("현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.", 400);
    const nextHash = await hashAdminPassword(input.newPassword);
    const oldVersion = await passwordVersion(previousHash);
    const nextVersion = await passwordVersion(nextHash);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const now = Math.floor(Date.now() / 1000);
    // One transaction changes the credential, revokes the previous version,
    // and keeps this browser signed in. Conditional writes handle concurrent changes.
    const results = await env.DB!.batch([
      env.DB!.prepare("UPDATE admin_credentials SET password_hash = ? WHERE id = 1 AND password_hash = ?").bind(nextHash, previousHash),
      env.DB!.prepare("DELETE FROM admin_sessions WHERE password_version = ? AND EXISTS (SELECT 1 FROM admin_credentials WHERE id = 1 AND password_hash = ?)").bind(oldVersion, nextHash),
      env.DB!.prepare("INSERT INTO admin_sessions (token_hash, password_version, expires_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM admin_credentials WHERE id = 1 AND password_hash = ?)").bind(await sha256(token), nextVersion, now + SESSION_SECONDS, nextHash),
    ]);
    if (!results[0].meta.changes) return fail("비밀번호가 이미 변경되었습니다. 다시 로그인해 주세요.", 409);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(request, token) } });
  } catch {
    return fail("비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
  }
}
