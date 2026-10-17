'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent } from 'react';
import ImageEditorDialog from './ImageEditorDialog';
import './image-tools.css';

type Photo = { url: string; uploadedAt?: string };
type EditPhoto = { source: string; file?: File; replace?: string; alt: string };
export type ImageToolsHandle = { openFiles(files: File[]): void };
type Props = {
  body: string;
  onInsert(markdown: string): void;
  onReplace(previous: string, next: string, description?: string): void;
};
const mediaPattern = /^\/media\/[0-9a-f-]{36}\.(?:png|jpe?g|webp|gif)$/iu;
const imagePattern = /!\[([^\]\n]{0,240})\]\((\/media\/[0-9a-f-]{36}\.(?:png|jpe?g|webp|gif))\)/giu;
const cleanAlt = (value: string) => value.replace(/[\[\]\r\n\u0000-\u001f]/gu, '').trim().slice(0, 240) || '사진';

export async function uploadPhoto(file: File): Promise<string> {
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) throw new Error('사진은 8MB 이하로 골라 주세요.');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('PNG, JPEG, WebP, GIF 사진을 골라 주세요.');
  const data = new FormData();
  data.append('file', file);
  const response = await fetch('/api/upload', { method: 'POST', body: data, cache: 'no-store' });
  const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || '사진을 저장하지 못했습니다. 다시 시도해 주세요.');
  if (!payload.url || !mediaPattern.test(payload.url)) throw new Error('저장된 사진 주소를 확인하지 못했습니다.');
  return payload.url;
}

const ImageTools = forwardRef<ImageToolsHandle, Props>(function ImageTools({ body, onInsert, onReplace }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const [editing, setEditing] = useState<EditPhoto | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [alt, setAlt] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const url = editing?.file ? editing.source : null;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [editing]);
  const bodyPhotos = Array.from(new Map(Array.from(body.matchAll(imagePattern), match => [match[2], { url: match[2], alt: match[1] }])).values());

  function openFiles(files: File[]) {
    if (editing) return;
    const file = files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size <= 0 || file.size > 8 * 1024 * 1024) {
      setMessage('8MB 이하의 PNG, JPEG, WebP, GIF 사진을 골라 주세요.');
      return;
    }
    const description = cleanAlt(file.name.replace(/\.[^.]+$/u, '').replace(/[-_]+/gu, ' '));
    setAlt(description);
    setMessage(files.length > 1 ? '한 번에 한 장씩 편집합니다. 첫 번째 사진을 열었어요.' : '');
    setEditing({ source: URL.createObjectURL(file), file, alt: description });
  }
  useImperativeHandle(ref, () => ({ openFiles }));

  async function loadPhotos(next?: string) {
    if (loading) return;
    setLoading(true); setMessage('');
    try {
      const response = await fetch(`/api/upload${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, { cache: 'no-store' });
      const payload = await response.json() as { images?: Photo[]; cursor?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || '사진 목록을 불러오지 못했습니다.');
      if (!alive.current) return;
      const list = (payload.images ?? []).filter(photo => mediaPattern.test(photo.url));
      setPhotos(previous => next ? [...previous, ...list] : list);
      setCursor(payload.cursor ?? null); setLoaded(true);
    } catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : '사진 목록을 불러오지 못했습니다.'); }
    finally { if (alive.current) setLoading(false); }
  }

  function editPhoto(url: string, description: string, replace = false) {
    setAlt(cleanAlt(description));
    setEditing({ source: url, alt: cleanAlt(description), ...(replace ? { replace: url } : {}) });
  }
  async function savePhoto(file: File) {
    const target = editing;
    if (!target) return;
    const url = await uploadPhoto(file);
    if (!alive.current) return;
    setPhotos(previous => [{ url }, ...previous]);
    if (target.replace) onReplace(target.replace, url);
    else onInsert(`![${cleanAlt(alt)}](${url})`);
    setMessage(target.replace ? '이 글의 사진을 편집본으로 바꿨습니다. 글을 저장하면 반영됩니다.' : '사진을 본문에 넣었습니다. 글을 저장하면 반영됩니다.');
    setEditing(null);
  }

  return <div className="image-tools">
    <div className="image-tools-heading">
      <span>사진을 끌어놓거나 붙여넣을 수도 있어요.</span>
      <div>
        <button className="button button-secondary" type="button" onClick={() => inputRef.current?.click()}>사진 추가 · 편집</button>
        <button className="button button-quiet" type="button" aria-expanded={libraryOpen} onClick={() => { setLibraryOpen(!libraryOpen); if (!libraryOpen && !loaded) void loadPhotos(); }}>사진 보관함</button>
      </div>
      <input ref={inputRef} className="admin-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="본문에 삽입할 사진 선택" onChange={(event: ChangeEvent<HTMLInputElement>) => { openFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    </div>
    {message && <p className="image-tools-message" role="status">{message}</p>}
    {bodyPhotos.length > 0 && <details className="image-tools-body-list">
      <summary>본문 사진 편집 <span>{bodyPhotos.length}장</span></summary>
      <p className="image-tools-message">같은 사진이 여러 번 쓰였으면 이 글의 해당 사진을 함께 바꿉니다. 사진 설명은 유지됩니다.</p>
      <div className="image-tools-grid">
        {bodyPhotos.map((photo, index) => <div className="image-tools-photo" key={photo.url}>
          <img src={photo.url} alt={photo.alt || `본문 사진 ${index + 1}`} loading="lazy" />
          <span>{photo.alt || `본문 사진 ${index + 1}`}</span>
          <button type="button" onClick={() => editPhoto(photo.url, photo.alt, true)} aria-label={`${index + 1}번 본문 사진 편집`}>사진 편집</button>
        </div>)}
      </div>
    </details>}
    {libraryOpen && <section className="image-tools-library" aria-label="사진 보관함">
      <div className="image-tools-library-title"><strong>올려 둔 사진</strong><button type="button" disabled={loading} onClick={() => void loadPhotos()}>새로고침</button></div>
      <div className="image-tools-grid">
        {photos.map((photo, index) => <div className="image-tools-photo" key={`${photo.url}-${index}`}>
          <img src={photo.url} alt={`보관함 사진 ${index + 1}`} loading="lazy" />
          <div className="image-tools-photo-actions">
            <button type="button" onClick={() => onInsert(`![사진](${photo.url})`)} aria-label={`${index + 1}번 보관함 사진 본문에 넣기`}>본문에 넣기</button>
            <button type="button" onClick={() => editPhoto(photo.url, '사진')} aria-label={`${index + 1}번 보관함 사진 편집해서 넣기`}>편집해서 넣기</button>
          </div>
        </div>)}
      </div>
      {loading && <p role="status">사진을 불러오는 중…</p>}
      {!loading && loaded && !photos.length && <p>아직 올린 사진이 없습니다.</p>}
      {cursor && <button type="button" className="button button-quiet" disabled={loading} onClick={() => void loadPhotos(cursor)}>사진 더 보기</button>}
    </section>}
    {editing && <>
      <ImageEditorDialog source={editing.source} description={alt} onDescriptionChange={!editing.replace ? setAlt : undefined} filename={editing.file?.name ?? (editing.source.split('/').pop() || 'photo.png')} onClose={() => setEditing(null)} onApply={savePhoto} onUseOriginal={editing.file ? () => savePhoto(editing.file!) : undefined} />
    </>}
  </div>;
});

export default ImageTools;
