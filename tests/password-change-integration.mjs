import assert from "node:assert/strict";

// This suite talks only to the isolated loopback development server.
const origin = process.env.BLOG_TEST_ORIGIN || "http://127.0.0.1:5173";
const password = process.env.BLOG_TEST_PASSWORD;
if (!password) {
  throw new Error("BLOG_TEST_PASSWORD is required to run password change tests.");
}

const replacementPassword = `QaChange-${Date.now()}-${crypto.randomUUID()}`;

function request(path, {
  cookie = "",
  method = "GET",
  json,
  body,
  headers = {},
} = {}) {
  return fetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
}

function cookiePair(setCookie) {
  const first = setCookie.split(";", 1)[0];
  const separator = first.indexOf("=");
  assert.ok(separator > 0, "password change must set a named session cookie");
  return first.slice(0, separator) + "=" + first.slice(separator + 1);
}

async function login(candidate) {
  const response = await request("/api/auth/login", {
    method: "POST",
    json: { password: candidate },
  });
  if (response.status !== 200) return { response, cookie: "" };
  const liveCookie = response.headers
    .getSetCookie()
    .find((value) => !/max-age\s*=\s*0/i.test(value));
  assert.ok(liveCookie, "successful login must return a live session cookie");
  return { response, cookie: cookiePair(liveCookie) };
}

async function adminStatus(cookie) {
  return (await request("/api/admin", { cookie })).status;
}

let firstSession = "";
let secondSession = "";
let activeSession = "";
let passwordChanged = false;

try {
  // The endpoint still requires the existing session, regardless of origin.
  assert.equal(
    (await request("/api/auth/password", {
      method: "POST",
      json: { currentPassword: password, newPassword: replacementPassword },
    })).status,
    401,
    "anonymous password changes must be rejected",
  );
  assert.equal(
    (await request("/api/auth/password", {
      method: "POST",
      headers: { Origin: "https://other.example" },
      json: { currentPassword: password, newPassword: replacementPassword },
    })).status,
    401,
    "anonymous password changes must remain protected regardless of origin",
  );

  const firstLogin = await login(password);
  assert.equal(firstLogin.response.status, 200, "the configured password must authenticate");
  firstSession = firstLogin.cookie;
  activeSession = firstSession;

  const secondLogin = await login(password);
  assert.equal(secondLogin.response.status, 200, "a second session must authenticate before a password change");
  secondSession = secondLogin.cookie;
  assert.equal(await adminStatus(firstSession), 200, "the first session must be active before a password change");
  assert.equal(await adminStatus(secondSession), 200, "the second session must be active before a password change");

  const crossOrigin = await request("/api/auth/password", {
    cookie: firstSession,
    method: "POST",
    headers: { Origin: "https://other.example" },
    json: { currentPassword: password, newPassword: "short" },
  });
  assert.equal(crossOrigin.status, 400, "cross-origin password changes must validate the password payload");
  assert.equal(await adminStatus(firstSession), 200, "an invalid cross-origin change must leave the session active");
  assert.equal((await login(password)).response.status, 200, "an invalid cross-origin change must leave the old password active");

  const mismatch = await request("/api/auth/password", {
    cookie: firstSession,
    method: "POST",
    json: { currentPassword: password + "-wrong", newPassword: replacementPassword },
  });
  assert.equal(mismatch.status, 401, "an incorrect current password must be rejected");
  assert.equal(await adminStatus(firstSession), 200, "a current-password mismatch must not revoke the session");
  assert.equal((await login(password)).response.status, 200, "a current-password mismatch must not change the password");

  const changed = await request("/api/auth/password", {
    cookie: firstSession,
    method: "POST",
    json: { currentPassword: password, newPassword: replacementPassword },
  });
  assert.equal(changed.status, 200, "a valid password change must succeed");
  passwordChanged = true;
  const changedCookie = changed.headers
    .getSetCookie()
    .find((value) => !/max-age\s*=\s*0/i.test(value));
  if (changedCookie) activeSession = cookiePair(changedCookie);
  else {
    // Keep recovery possible even if a server regression omits Set-Cookie.
    const recoveryLogin = await login(replacementPassword);
    if (recoveryLogin.response.status === 200) activeSession = recoveryLogin.cookie;
  }
  assert.ok(changedCookie, "a successful password change must rotate the current session cookie");
  assert.notEqual(activeSession, firstSession, "a successful password change must rotate the current session");

  assert.equal(await adminStatus(firstSession), 401, "the pre-change session must be revoked");
  assert.equal(await adminStatus(secondSession), 401, "other sessions must be revoked after a password change");
  assert.equal(await adminStatus(activeSession), 200, "the rotated session must remain active");
  assert.equal((await login(password)).response.status, 401, "the old password must be rejected after a password change");

  const replacementLogin = await login(replacementPassword);
  assert.equal(replacementLogin.response.status, 200, "the new password must authenticate");
  assert.equal(await adminStatus(replacementLogin.cookie), 200, "a session from the new password must be active");
  activeSession = replacementLogin.cookie;

  console.log("PASS: password-only authentication, password-change validation, cross-origin state changes, current-session rotation, and other-session revocation.");
} finally {
  // Always return the local test server to BLOG_TEST_PASSWORD so later suites
  // and the developer's local session keep using the configured test secret.
  if (passwordChanged) {
    const restore = await request("/api/auth/password", {
      cookie: activeSession,
      method: "POST",
      json: { currentPassword: replacementPassword, newPassword: password },
    });
    assert.equal(restore.status, 200, "the temporary test password must be restored");
    const restoreCookie = restore.headers
      .getSetCookie()
      .find((value) => !/max-age\s*=\s*0/i.test(value));
    if (restoreCookie) activeSession = cookiePair(restoreCookie);
  }
  for (const cookie of new Set([firstSession, secondSession, activeSession].filter(Boolean))) {
    await request("/api/auth/logout", { cookie, method: "POST" });
  }
}
