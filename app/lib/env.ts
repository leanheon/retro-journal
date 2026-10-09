import { env as workerEnv } from "cloudflare:workers";

type BlogEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  BLOG_OWNER_EMAIL?: string;
  BLOG_ORIGIN?: string;
};

export const env = workerEnv as typeof workerEnv & BlogEnv;

export function blogOrigin(request?: Request): string {
  const configured = env.BLOG_ORIGIN?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // A malformed deployment value should not make generated links invalid.
    }
  }

  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      // Fall through to a harmless local origin for non-request callers.
    }
  }

  return "http://localhost:3000";
}
