import { cookies } from "next/headers";
import { env } from "./env";

export const ADMIN_COOKIE = "blog_admin_session";
export const SESSION_SECONDS = 8 * 60 * 60;
export type AdminUser = { displayName: string };
export type OwnerCheck =
  | { ok: true; user: AdminUser }
  | { ok: false; response: Response };

const HASH_PATTERN = /^pbkdf2-sha256\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const encoder = new TextEncoder();

export function passwordIsConfigured(): boolean {
  return Boolean(env.DB && HASH_PATTERN.test(env.BLOG_ADMIN_PASSWORD_HASH ?? ""));
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const match = HASH_PATTERN.exec(env.BLOG_ADMIN_PASSWORD_HASH ?? "");
  // HMAC keys shorter than its block size can otherwise treat trailing NULs
  // as equivalent padding. Passwords must be printable, exact input.
  if (!match || password.length > 256 || /[\u0000-\u001f\u007f]/.test(password)) return false;
  const salt = Uint8Array.from(match[1].match(/../g)!, value => Number.parseInt(value, 16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  // Workers supports up to 100,000 PBKDF2 iterations per call.
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256,
  ));
  const expected = Uint8Array.from(match[2].match(/../g)!, value => Number.parseInt(value, 16));
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= derived[index] ^ expected[index];
  return difference === 0;
}

export async function passwordVersion(): Promise<string> {
  return sha256(env.BLOG_ADMIN_PASSWORD_HASH ?? "");
}

export async function getAdminUser(): Promise<AdminUser | null> {
  if (!passwordIsConfigured()) return null;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await env.DB!.prepare(
    "SELECT expires_at, password_version FROM admin_sessions WHERE token_hash = ?",
  ).bind(await sha256(token)).first<{ expires_at: number; password_version: string }>();
  if (!session || session.expires_at <= Math.floor(Date.now() / 1000) || session.password_version !== await passwordVersion()) return null;
  return { displayName: "김지헌" };
}

export async function requireBlogOwner(): Promise<OwnerCheck> {
  const headers = { "Cache-Control": "no-store" };
  if (!passwordIsConfigured()) {
    return { ok: false, response: Response.json({ error: "관리자 비밀번호가 아직 설정되지 않았습니다." }, { status: 503, headers }) };
  }
  const user = await getAdminUser();
  if (!user) return { ok: false, response: Response.json({ error: "관리자 비밀번호로 로그인해 주세요." }, { status: 401, headers }) };
  return { ok: true, user };
}

export function sessionCookie(request: Request, token: string, maxAge = SESSION_SECONDS): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
