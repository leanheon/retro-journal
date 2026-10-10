import { requireBlogOwner } from "../../lib/auth";
import { env } from "../../lib/env";
import { jsonError, noStoreHeaders, sameOriginError } from "../../lib/http";
import { UPLOADED_IMAGE_KEY_PATTERN } from "../../lib/validation";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_LIST_LIMIT = 40;

type ImageType = {
  extension: "png" | "jpg" | "webp" | "gif";
  contentType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
};

const IMAGE_TYPES: Record<string, ImageType> = {
  "image/png": { extension: "png", contentType: "image/png" },
  "image/jpeg": { extension: "jpg", contentType: "image/jpeg" },
  "image/webp": { extension: "webp", contentType: "image/webp" },
  "image/gif": { extension: "gif", contentType: "image/gif" },
};

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function matchesSignature(bytes: Uint8Array, type: ImageType): boolean {
  switch (type.contentType) {
    case "image/png":
      return bytes.length >= 8 && hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return bytes.length >= 3 && hasBytes(bytes, 0, [0xff, 0xd8, 0xff]);
    case "image/webp":
      return bytes.length >= 12 && hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50]);
    case "image/gif":
      return bytes.length >= 6 && (hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || hasBytes(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
  }
}

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;

  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  const bucket = env.BUCKET;
  if (!bucket) return jsonError("이미지 저장소가 아직 설정되지 않았습니다.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("multipart/form-data 형식으로 이미지 파일을 보내 주세요.");
  }

  const value = form.get("file");
  if (!(value instanceof File)) return jsonError("file 필드에 이미지 파일을 첨부해 주세요.");
  if (value.size <= 0) return jsonError("빈 이미지 파일은 업로드할 수 없습니다.");
  if (value.size > MAX_IMAGE_BYTES) return jsonError("이미지는 8MB 이하로 업로드해 주세요.");

  const type = IMAGE_TYPES[value.type.toLowerCase()];
  if (!type) return jsonError("PNG, JPEG, WebP, GIF 이미지만 업로드할 수 있습니다.");

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await value.arrayBuffer());
  } catch {
    return jsonError("이미지 파일을 읽지 못했습니다.");
  }
  if (bytes.length > MAX_IMAGE_BYTES || !matchesSignature(bytes, type)) {
    return jsonError("파일 내용이 이미지 MIME 형식과 일치하지 않습니다.");
  }

  const key = `${crypto.randomUUID().toLowerCase()}.${type.extension}`;
  try {
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType: type.contentType,
        cacheControl: "no-store",
      },
    });
  } catch {
    return jsonError("이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  return Response.json({ url: `/media/${key}` }, { status: 201, headers: noStoreHeaders() });
}

export async function GET(request: Request) {
  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  const bucket = env.BUCKET;
  if (!bucket) return jsonError("이미지 저장소가 아직 설정되지 않았습니다.", 503);

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "24");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : 24;
  const cursor = url.searchParams.get("cursor")?.trim() || undefined;

  try {
    const listed = await bucket.list({ limit, ...(cursor ? { cursor } : {}) });
    const images = listed.objects
      .filter((object) => UPLOADED_IMAGE_KEY_PATTERN.test(object.key))
      .map((object) => ({
        url: `/media/${object.key}`,
        uploadedAt: object.uploaded.toISOString(),
      }));
    return Response.json(
      { images, cursor: listed.truncated ? listed.cursor : null },
      { headers: noStoreHeaders() },
    );
  } catch {
    return jsonError("이미지 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
