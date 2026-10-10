import assert from "node:assert/strict";
import { readFile } from 'node:fs/promises';

const origin = "http://127.0.0.1:5173";
const password = process.env.BLOG_TEST_PASSWORD;
if (!password) throw new Error("BLOG_TEST_PASSWORD is required to run cover integration tests.");
let cookie = "";
const ids = [];

async function request(path, { owner = false, method = "GET", json, body, headers = {} } = {}) {
  return fetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      ...(owner ? { Cookie: cookie } : {}),
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { Origin: origin } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
}

async function data(response, status = 200) {
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}

try {
  assert.equal((await request("/api/upload")).status, 401);

  const login = await request("/api/auth/login", { method: "POST", json: { password } });
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  assert.ok(cookie);

  // Exercise a real >1MB image, not just a tiny signature-only upload.
  const png = new Uint8Array(await readFile(new URL('../public/images/typewriter-cutout.png', import.meta.url)));
  assert.ok(png.length > 1024 * 1024 && png.length <= 8 * 1024 * 1024);
  const form = new FormData();
  form.set("file", new File([png], "cover.png", { type: "image/png" }));
  const media = await data(await request("/api/upload", {
    owner: true,
    method: "POST",
    body: form,
  }), 201);

  const listed = await data(await request("/api/upload?limit=40", { owner: true }));
  assert.ok(listed.images.some((image) => image.url === media.url));
  assert.ok(listed.cursor === null || typeof listed.cursor === "string");

  const suffix = Date.now();
  const draft = (await data(await request("/api/posts", {
    owner: true,
    method: "POST",
    json: {
      title: "표지 저장 검증",
      slug: "cover-qa-" + suffix,
      body: "본문에는 표지 이미지 경로를 넣지 않습니다.",
      published: false,
      coverImage: media.url,
      coverTitle: false,
      coverTone: "original",
    },
  }), 201)).post;
  ids.push(draft.id);
  assert.equal(draft.coverImage, media.url);
  assert.equal(draft.coverTitle, false);
  assert.equal(draft.coverTone, "original");

  const updated = (await data(await request("/api/posts/" + draft.id, {
    owner: true,
    method: "PUT",
    json: { coverTitle: true, coverTone: "newsprint" },
  }))).post;
  assert.equal(updated.coverImage, media.url);
  assert.equal(updated.coverTitle, true);
  assert.equal(updated.coverTone, "newsprint");

  const invalidCover = await request("/api/posts", {
    owner: true,
    method: "POST",
    json: {
      title: "외부 표지 거부",
      slug: "cover-invalid-" + suffix,
      body: "외부 URL 표지는 허용하지 않습니다.",
      coverImage: "https://example.com/image.png",
    },
  });
  assert.equal(invalidCover.status, 400);

  // A draft's cover is private even when the object itself exists in R2.
  assert.equal((await request(media.url)).status, 404);
  await data(await request("/api/posts/" + draft.id, {
    owner: true,
    method: "PUT",
    json: { published: true },
  }));
  assert.equal((await request(media.url)).status, 200);

  const backup = await data(await request("/api/backup", { owner: true }));
  const saved = backup.posts.find((post) => post.id === draft.id);
  assert.equal(saved.coverImage, media.url);
  assert.equal(saved.coverTitle, true);
  assert.equal(saved.coverTone, "newsprint");

  const restoredSlug = "cover-restore-" + suffix;
  const restoredPayload = {
    ...backup,
    posts: [{
      ...saved,
      id: 0,
      slug: restoredSlug,
      title: "복원된 표지",
      coverTitle: false,
      coverTone: "original",
    }],
  };
  await data(await request("/api/restore", {
    owner: true,
    method: "POST",
    json: restoredPayload,
  }));
  const admin = await data(await request("/api/admin", { owner: true }));
  const restored = admin.posts.find((post) => post.slug === restoredSlug);
  assert.ok(restored);
  ids.push(restored.id);
  assert.equal(restored.coverImage, media.url);
  assert.equal(restored.coverTitle, false);
  assert.equal(restored.coverTone, "original");

  console.log("PASS: uploaded cover selection, cover title/tone persistence, invalid external cover rejection, draft media privacy, public cover-only media, upload listing auth, backup, and restore.");
} finally {
  for (const id of ids) {
    await request("/api/posts/" + id, { owner: true, method: "DELETE" });
  }
  if (cookie) await request("/api/auth/logout", { owner: true, method: "POST" });
}
