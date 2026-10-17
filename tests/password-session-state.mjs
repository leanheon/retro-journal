import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

// Only this checkout's local DB and test-created session rows are changed.
const origin = process.env.BLOG_TEST_ORIGIN || 'http://127.0.0.1:5173';
const password = process.env.BLOG_TEST_PASSWORD;
if (!password) throw new Error('BLOG_TEST_PASSWORD is required.');
const directory = new URL('../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/', import.meta.url);
let db;
for (const file of readdirSync(directory).filter(name => name.endsWith('.sqlite'))) {
  const candidate = new DatabaseSync(fileURLToPath(new URL(file, directory)));
  if (candidate.prepare("SELECT name FROM sqlite_master WHERE name='admin_sessions'").get()) { db = candidate; break; }
  candidate.close();
}
if (!db) throw new Error('Local session DB not found. Apply local migrations first.');
const hashes = [];
const digest = value => createHash('sha256').update(value).digest('hex');
const headers = { 'Content-Type': 'application/json' };
async function login(cookie = '') {
  const response = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ password }) });
  assert.equal(response.status, 200);
  const nextCookie = response.headers.getSetCookie()[0].split(';')[0];
  const token = nextCookie.slice(nextCookie.indexOf('=') + 1);
  hashes.push(digest(token));
  assert.ok(db.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=?').get(digest(token)), 'only the session digest is stored');
  assert.equal(db.prepare('SELECT token_hash FROM admin_sessions WHERE token_hash=?').get(token), undefined, 'raw token is not stored');
  return nextCookie;
}
async function adminStatus(cookie) {
  return (await fetch(`${origin}/api/admin`, { headers: { Cookie: cookie } })).status;
}
try {
  const first = await login();
  const second = await login(first);
  assert.notEqual(first, second, 'login must rotate an existing session');
  assert.equal(await adminStatus(first), 401, 'rotated session cannot be reused');
  assert.equal(await adminStatus(second), 200);
  const crossOriginLogout = await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { Origin: 'https://other.example', Cookie: second } });
  assert.ok([200, 204].includes(crossOriginLogout.status), 'cross-origin logout must be accepted');
  assert.equal(await adminStatus(second), 401, 'cross-origin logout must invalidate the session');
  const expiring = await login();
  db.prepare('UPDATE admin_sessions SET expires_at=0 WHERE token_hash=?').run(hashes.at(-1));
  assert.equal(await adminStatus(expiring), 401, 'expired session must be denied');
  const third = await login();
  db.prepare('UPDATE admin_sessions SET password_version=? WHERE token_hash=?').run('qa-obsolete-version', hashes.at(-1));
  assert.equal(await adminStatus(third), 401, 'session from an old password version must be denied');
  console.log('PASS: session token storage, rotation, expiry, password-version invalidation, and cross-origin logout invalidation.');
} finally {
  for (const hash of hashes) db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').run(hash);
  db.close();
}
