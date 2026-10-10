import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
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
  if (password.length < 10 || password.length > 256 || /[\u0000-\u001f\u007f]/.test(password)) throw new Error('제어 문자 없는 10~256자의 비밀번호를 입력해 주세요.');
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  const encoded = ['pbkdf2-sha256', '100000', salt.toString('hex'), hash].join('$');
  const file = new URL('../.dev.vars', import.meta.url);
  let content = '';
  try { content = readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  content = content.replace(/^BLOG_ADMIN_PASSWORD_HASH=.*(?:\r?\n|$)/gm, '').replace(/^BLOG_OWNER_EMAIL=.*(?:\r?\n|$)/gm, '').trimEnd();
  writeFileSync(file, `${content}\nBLOG_ADMIN_PASSWORD_HASH=${JSON.stringify(encoded)}\n`);
  console.log('로컬 비밀번호 해시를 저장했습니다. 개발 서버를 다시 시작하면 적용됩니다.');
} finally { prompt.close(); }
