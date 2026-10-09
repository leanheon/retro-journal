import { blogOrigin } from "./env";

export function jsonError(message: string, status = 400, details?: unknown) {
  return Response.json(
    details === undefined ? { error: message } : { error: message, details },
    { status },
  );
}

export function noStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store",
  };
}

export function publicCacheHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store",
  };
}

/**
 * Browser mutations must remain same-origin. Requests from scripts without an
 * Origin/Referer header are allowed for owner-operated tooling; any header
 * that is present must match the configured canonical origin.
 */
export function sameOriginError(request: Request): Response | null {
  const origin = request.headers.get("origin")?.trim();
  const referer = request.headers.get("referer")?.trim();
  const candidate = origin || referer;
  if (!candidate) return null;

  try {
    const candidateOrigin = new URL(candidate).origin;
    if (candidateOrigin !== blogOrigin(request)) {
      return jsonError("같은 사이트에서 보낸 요청만 처리할 수 있습니다.", 403);
    }
  } catch {
    return jsonError("요청 출처를 확인할 수 없습니다.", 403);
  }

  return null;
}

export function parseNumericId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function absoluteUrl(path: string, request?: Request): string {
  return new URL(path, `${blogOrigin(request)}/`).toString();
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
