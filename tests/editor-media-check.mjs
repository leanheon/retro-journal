import assert from 'node:assert/strict';
import sharp from 'sharp';

// Verify a 600x400 four-colour fixture after the real browser editor rotates
// it clockwise by 90 degrees and applies 100% grayscale. The browser test
// supplies the new private media path; credentials never enter the source.
const origin = 'http://127.0.0.1:5173';
const path = process.env.EDITOR_TEST_MEDIA_URL;
const password = process.env.BLOG_TEST_PASSWORD;
assert.match(path ?? '', /^\/media\/[0-9a-f-]{36}\.(png|jpg)$/);
assert.ok(password, 'BLOG_TEST_PASSWORD is required.');
const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
assert.equal(login.status, 200);
const cookie = login.headers.getSetCookie()[0].split(';')[0];
try {
  assert.equal((await fetch(origin + path)).status, 404, 'unsaved editor media stays private');
  const image = await fetch(origin + path, { headers: { Cookie: cookie } });
  assert.equal(image.status, 200);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert.ok(bytes.length <= 8 * 1024 * 1024);
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 400, 'rotation preserves the complete original height');
  assert.equal(info.height, 600, 'rotation preserves the complete original width');
  const expected = [[40, 90, 210], [220, 45, 40], [235, 190, 40], [45, 175, 85]];
  [[100, 150], [300, 150], [100, 450], [300, 450]].forEach(([x, y], index) => {
    const offset = (y * info.width + x) * info.channels;
    const pixel = Array.from(data.subarray(offset, offset + 3));
    assert.ok(Math.max(...pixel) - Math.min(...pixel) <= 2, 'grayscale must be baked into the saved image');
    const [r, g, b] = expected[index];
    assert.ok(Math.abs(pixel[0] - (0.2126 * r + 0.7152 * g + 0.0722 * b)) <= 4, 'saved quadrant orientation matches the preview');
  });
  console.log('PASS: real image-editor output dimensions, clockwise orientation, grayscale pixels, upload limit, and draft privacy.');
} finally {
  await fetch(origin + '/api/auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
}
