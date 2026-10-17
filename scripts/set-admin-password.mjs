import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

// Run locally in a terminal. Input is hidden and the hash is never printed.
if (!process.stdin.isTTY) throw new Error('Run this password setup in an interactive terminal.');
const hiddenOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
const prompt = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true });
const ask = label => new Promise(resolve => { process.stdout.write(label); prompt.question('', answer => { process.stdout.write('\n'); resolve(answer); }); });
try {
  const password = await ask('새 관리자 비밀번호: ');
  const confirmation = await ask('한 번 더 입력: ');
  if (password !== confirmation) throw new Error('비밀번호가 일치하지 않습니다.');
  if (password.length < 8 || password.length > 256 || /[\u0000-\u001f\u007f]/.test(password)) throw new Error('제어 문자 없는 8~256자의 비밀번호를 입력해 주세요.');
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  const encoded = ['pbkdf2-sha256', '100000', salt.toString('hex'), hash].join('$');
  const directory = new URL('../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/', import.meta.url);
  let updated = false;
  for (const name of readdirSync(directory).filter(name => name.endsWith('.sqlite'))) {
    const db = new DatabaseSync(fileURLToPath(new URL(name, directory)));
    try {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE name='admin_credentials'").get()) continue;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO admin_credentials (id, password_hash) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash').run(encoded);
        db.prepare('DELETE FROM admin_sessions').run();
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      updated = true;
      break;
    } finally { db.close(); }
  }
  if (!updated) throw new Error('로컬 관리자 데이터베이스가 없습니다. 먼저 사이트를 실행하고 마이그레이션을 적용해 주세요.');
  console.log('로컬 비밀번호를 변경하고 기존 로그인을 종료했습니다. 새 비밀번호로 로그인하세요.');
} finally { prompt.close(); }
