import assert from "node:assert/strict";

// This suite talks only to the isolated loopback development server. The
// password is supplied by the test harness and is never printed.
const password = process.env.BLOG_TEST_PASSWORD;
if (!password) {
  throw new Error("BLOG_TEST_PASSWORD is required to run login origin tests.");
}

const port = process.env.BLOG_TEST_PORT || "5173";
const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
const foreignHeaders = {
  Origin: "https://foreign.example",
  Referer: "https://foreign.example/login",
  "Sec-Fetch-Site": "cross-site",
  "X-Forwarded-Host": "foreign.example",
  "X-Forwarded-For": "203.0.113.10",
};

function request(origin, path, {
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
  assert.ok(separator > 0, "successful login must set a named session cookie");
  return first.slice(0, separator) + "=" + first.slice(separator + 1);
}

async function login(origin, candidate, headers = {}) {
  const response = await request(origin, "/api/auth/login", {
    method: "POST",
    headers,
    json: { password: candidate },
  });
  if (response.status !== 200) return { response, cookie: "" };
  const liveCookie = response.headers
    .getSetCookie()
    .find((value) => !/max-age\s*=\s*0/i.test(value));
  assert.ok(liveCookie, "successful login must return a live session cookie");
  return { response, cookie: cookiePair(liveCookie) };
}

const sessions = [];

try {
  for (const origin of origins) {
    // Login is password-only: the target host and caller-supplied browser or
    // proxy headers must not decide whether the correct password authenticates.
    const correct = await login(origin, password, foreignHeaders);
    assert.equal(correct.response.status, 200, `${origin} must accept the configured password with foreign headers`);
    sessions.push({ origin, cookie: correct.cookie });

    const wrong = await login(origin, password + "-wrong", foreignHeaders);
    assert.equal(wrong.response.status, 401, `${origin} must reject a wrong password with foreign headers`);

    const admin = await request(origin, "/api/admin", {
      cookie: correct.cookie,
      headers: foreignHeaders,
    });
    assert.equal(admin.status, 200, `${origin} admin session must survive foreign request headers`);
  }

  // Logout is an authenticated mutation. It must remain usable with arbitrary
  // browser-origin metadata, then revoke the session as usual.
  const session = sessions[0];
  const logout = await request(session.origin, "/api/auth/logout", {
    cookie: session.cookie,
    method: "POST",
    headers: foreignHeaders,
  });
  assert.ok([200, 204].includes(logout.status), "authenticated logout must not reject foreign headers");
  assert.equal(
    (await request(session.origin, "/api/admin", { cookie: session.cookie })).status,
    401,
    "a cross-header logout must revoke the session",
  );
  session.cookie = "";

  // Authentication still protects mutations for anonymous callers regardless
  // of the request's origin metadata.
  const anonymousWrite = await request(origins[0], "/api/posts", {
    method: "POST",
    headers: foreignHeaders,
    json: {},
  });
  assert.equal(anonymousWrite.status, 401, "anonymous admin writes must remain protected");

  console.log("PASS: password-only login accepts localhost and 127.0.0.1 with arbitrary origin metadata, rejects wrong passwords, permits authenticated logout, and protects anonymous writes.");
} finally {
  for (const session of sessions) {
    if (!session.cookie) continue;
    await request(session.origin, "/api/auth/logout", {
      cookie: session.cookie,
      method: "POST",
      headers: foreignHeaders,
    });
  }
}
