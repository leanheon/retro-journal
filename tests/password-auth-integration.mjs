import assert from "node:assert/strict";

// This suite talks only to the isolated loopback development server.
const origin = "http://127.0.0.1:5173";
const password = process.env.BLOG_TEST_PASSWORD;
if (!password) {
  throw new Error("BLOG_TEST_PASSWORD is required to run password auth tests.");
}

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
      ...(method !== "GET" ? { Origin: origin } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
}

function cookiePair(setCookie) {
  const first = setCookie.split(";", 1)[0];
  const separator = first.indexOf("=");
  assert.ok(separator > 0, "login must set a named session cookie");
  return first.slice(0, separator) + "=" + first.slice(separator + 1);
}

function cookieName(cookie) {
  const separator = cookie.indexOf("=");
  assert.ok(separator > 0, "session cookie must have a name");
  return cookie.slice(0, separator);
}

function assertStatus(response, status, message) {
  assert.equal(response.status, status, message);
  return response;
}

let session = "";

try {
  // Anonymous access must not be granted by fabricated cookies or the old
  // connector-only identity headers.
  assertStatus(await request("/api/admin"), 401, "anonymous admin API must be protected");
  assertStatus(await request("/api/upload"), 401, "anonymous upload API must be protected");
  assertStatus(
    await request("/api/posts", { method: "POST", json: {} }),
    401,
    "anonymous write API must be protected",
  );
  assertStatus(
    await request("/api/admin", {
      headers: {
        Cookie: "blog_session=fabricated; session=fabricated",
        "oai-authenticated-user-id": "fabricated-user",
        "oai-authenticated-user-email": "fabricated@example.invalid",
      },
    }),
    401,
    "fabricated connector identity must not bypass authentication",
  );

  // The public journal remains available without an admin session.
  assertStatus(await request("/"), 200, "public home must remain available anonymously");

  const wrongPassword = password + "-wrong";
  assertStatus(
    await request("/api/auth/login", {
      method: "POST",
      json: { password: wrongPassword },
    }),
    401,
    "an incorrect password must be rejected",
  );

  // Login uses only the configured password. Caller-supplied IP headers must
  // not create a shared lockout after repeated incorrect passwords.
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const response = await request("/api/auth/login", {
      method: "POST",
      headers: {
        "CF-Connecting-IP": `198.51.100.${attempt + 1}`,
        "X-Forwarded-For": `203.0.113.${attempt + 1}`,
        Forwarded: `for=192.0.2.${attempt + 1}`,
      },
      json: { password: wrongPassword },
    });
    assert.equal(response.status, 401, "incorrect passwords must remain ordinary authentication failures");
  }

  assertStatus(
    await request("/api/auth/login", {
      method: "POST",
      headers: { Origin: "https://other.example" },
      json: { password },
    }),
    403,
    "cross-origin login must be rejected",
  );

  assertStatus(
    await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"password":',
    }),
    400,
    "malformed login JSON must be rejected",
  );

  const login = await request("/api/auth/login", {
    method: "POST",
    json: { password },
  });
  assertStatus(login, 200, "the configured password must authenticate");

  const setCookies = login.headers.getSetCookie();
  assert.ok(setCookies.length > 0, "login must return Set-Cookie");
  const loginCookie = setCookies.find((value) => !/max-age\s*=\s*0/i.test(value));
  assert.ok(loginCookie, "login must return a live session cookie");
  const cookieAttributes = loginCookie.toLowerCase();
  assert.match(cookieAttributes, /\bhttponly\b/, "session cookie must be HttpOnly");
  assert.match(cookieAttributes, /\bsamesite\s*=\s*strict\b/, "session cookie must be SameSite=Strict");
  assert.match(cookieAttributes, /\bpath\s*=\s*\//, "session cookie must be scoped to the site root");
  assert.match(cookieAttributes, /\bmax-age\s*=\s*\d+\b/, "session cookie must have Max-Age");
  assert.doesNotMatch(cookieAttributes, /(?:^|;)\s*secure(?:;|$)/, "loopback session cookie must not require Secure");

  session = cookiePair(loginCookie);
  const name = cookieName(session);
  assert.notEqual(name, "", "session cookie name must not be empty");

  assertStatus(await request("/api/admin", { cookie: session }), 200, "authenticated admin API must be available");
  assertStatus(await request("/admin", { cookie: session }), 200, "authenticated admin page must be available");

  assertStatus(
    await request("/api/admin", {
      cookie: `${name}=fabricated-session-value`,
      headers: {
        "oai-authenticated-user-id": "fabricated-user",
        "oai-authenticated-user-email": "fabricated@example.invalid",
      },
    }),
    401,
    "a forged session cookie must be rejected",
  );

  const logout = await request("/api/auth/logout", {
    cookie: session,
    method: "POST",
  });
  assert.ok([200, 204].includes(logout.status), "logout must complete successfully");
  const logoutCookies = logout.headers.getSetCookie();
  assert.ok(
    logoutCookies.some((value) => /max-age\s*=\s*0/i.test(value) || /expires\s*=\s*(thu,\s*)?01 jan 1970/i.test(value)),
    "logout must expire the session cookie",
  );
  assertStatus(await request("/api/admin", { cookie: session }), 401, "a logged-out session must not be reusable");
  session = "";

  console.log("PASS: password auth anonymous protection, password-only login, cookie attributes, admin access, forged/logout session rejection, and IP-header independence.");
} finally {
  if (session) {
    await request("/api/auth/logout", { cookie: session, method: "POST" });
  }
}
