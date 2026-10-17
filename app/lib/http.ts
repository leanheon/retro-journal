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
