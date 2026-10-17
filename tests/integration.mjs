import assert from 'node:assert/strict';

// This suite only writes to the isolated loopback development database.
const origin = process.env.BLOG_TEST_ORIGIN || 'http://127.0.0.1:5173';
const password = process.env.BLOG_TEST_PASSWORD;
if (!password) throw new Error('BLOG_TEST_PASSWORD is required to run integration tests.');
let cookie = '';
const ids = [];
async function request(path, { owner = false, method = 'GET', json, body, headers = {} } = {}) {
 const response = await fetch(origin + path, { method, redirect: 'manual', headers: { ...(owner ? {Cookie: cookie} : {}), ...(json !== undefined ? {'Content-Type':'application/json'} : {}), ...headers }, body: json !== undefined ? JSON.stringify(json) : body });
 return response;
}
async function data(response, status = 200) {
 const result = await response.json();
 assert.equal(response.status, status, JSON.stringify(result));
 return result;
}
try {
 assert.equal((await request('/api/admin')).status, 401);
 assert.equal((await request('/api/posts', {method:'POST',json:{},headers:{Origin:'https://other.example'}})).status, 401);
 const login = await request('/api/auth/login',{method:'POST',json:{password}});
 assert.equal(login.status,200);
 cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
 assert.ok(cookie);
 const admin = await data(await request('/api/admin',{owner:true}));
 assert.ok(Array.isArray(admin.posts));
 const suffix = Date.now();
 const draft = (await data(await request('/api/posts',{owner:true,method:'POST',json:{title:'통합 검증용 초안',slug:`qa-${suffix}`,body:'# 테스트\n\n<script>alert(1)</script>\n\n**본문**',category:'생각',tags:['검증'],published:false,featured:false,cover:'sun'}}),201)).post;
 ids.push(draft.id);
 assert.equal((await request(`/posts/${draft.slug}`)).status,404);
 assert.ok(!(await data(await request('/api/posts'))).posts.some(p=>p.id===draft.id));
 assert.ok(!(await (await request('/feed.xml')).text()).includes(draft.slug));
 assert.equal((await request(`/api/posts/${draft.id}`,{owner:true,method:'PUT',json:{featured:true},headers:{Origin:'https://other.example'}})).status,200);
 assert.equal((await request('/api/posts',{owner:true,method:'POST',json:null})).status,400);
 assert.equal((await request(`/api/posts/${draft.id}`,{owner:true,method:'PUT',json:{title:''}})).status,400);
 const korean = (await data(await request('/api/posts',{owner:true,method:'POST',json:{title:'한글 주소 검증',slug:`한글-기록-${suffix}`,body:'한글 주소도 열립니다.',published:true}}),201)).post;
 ids.push(korean.id);
 assert.equal((await request(`/posts/${encodeURIComponent(korean.slug)}`)).status,200);
 assert.equal((await request('/api/posts',{owner:true,method:'POST',json:{title:'중복',slug:draft.slug,body:'본문'}})).status,409);
 const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2a0AAAAASUVORK5CYII=','base64'));
 const form = new FormData(); form.set('file',new File([png],'qa.png',{type:'image/png'}));
 const media = await data(await request('/api/upload',{owner:true,method:'POST',body:form}),201);
 assert.equal((await request(media.url)).status,404);
 assert.equal((await request(media.url,{owner:true})).status,200);
 const body = draft.body + `\n\n![검증 이미지](${media.url})`;
 await data(await request(`/api/posts/${draft.id}`,{owner:true,method:'PUT',json:{body,published:true,featured:true}}));
 const publishedPage = await request(`/posts/${draft.slug}`);
 assert.equal(publishedPage.status,200);
 const html = await publishedPage.text();
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>alert(1)</script>'));
 assert.ok((await data(await request('/api/posts'))).posts.some(p=>p.id===draft.id));
 assert.equal((await request(media.url)).status,200);
 assert.ok((await (await request('/feed.xml')).text()).includes(draft.slug));
 assert.ok((await (await request('/sitemap.xml')).text()).includes(draft.slug));
 await data(await request(`/api/posts/${draft.id}`,{owner:true,method:'PUT',json:{published:false}}));
 assert.equal((await request(media.url)).status,404);
 assert.equal((await request(`/posts/${draft.slug}`)).status,404);
 const backup = await data(await request('/api/backup',{owner:true}));
 assert.ok(backup.posts.some(p=>p.id===draft.id));
 assert.equal(backup.version,1);
 const editedBackup = structuredClone(backup);
 editedBackup.posts.find(p=>p.id===draft.id).title = '기존 글을 덮어쓰면 안 됨';
 await data(await request('/api/restore',{owner:true,method:'POST',json:editedBackup}));
 const afterRestore = await data(await request('/api/admin',{owner:true}));
 assert.equal(afterRestore.posts.find(p=>p.id===draft.id).title,draft.title);
 const invalid = new FormData(); invalid.set('file',new File(['<svg/>'],'bad.png',{type:'image/png'}));
 assert.equal((await request('/api/upload',{owner:true,method:'POST',body:invalid})).status,400);
 console.log('PASS: owner authentication, CRUD, draft privacy, image upload/privacy, XSS escaping, RSS/sitemap, duplicate validation, cross-origin mutations, backup and safe restore.');
} finally {
 for (const id of ids) await request(`/api/posts/${id}`,{owner:true,method:'DELETE'});
 if (cookie) await request('/api/auth/logout',{owner:true,method:'POST'});
}
