import { getChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";
import { env } from "./env";

export type OwnerCheck =
  | { ok: true; user: ChatGPTUser }
  | { ok: false; response: Response };

function authError(message: string, status: number): OwnerCheck {
  return {
    ok: false,
    response: Response.json({ error: message }, { status }),
  };
}

/**
 * Check the configured owner on every admin request. In particular, the first
 * authenticated visitor can never become the owner because there is no
 * database claim or fallback identity path here.
 */
export async function requireBlogOwner(): Promise<OwnerCheck> {
  const configuredEmail = env.BLOG_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) {
    return authError(
      "관리자 이메일이 아직 설정되지 않았습니다. BLOG_OWNER_EMAIL을 설정해 주세요.",
      503,
    );
  }

  const user = await getChatGPTUser();
  if (!user) {
    return authError("ChatGPT 로그인 후 관리자 기능을 사용할 수 있습니다.", 401);
  }

  if (user.email.trim().toLowerCase() !== configuredEmail) {
    return authError("이 블로그의 관리자 계정이 아닙니다.", 403);
  }

  return { ok: true, user };
}

export function isBlogOwnerEmail(email: string | null | undefined): boolean {
  const configuredEmail = env.BLOG_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(
    configuredEmail && email && email.trim().toLowerCase() === configuredEmail,
  );
}
