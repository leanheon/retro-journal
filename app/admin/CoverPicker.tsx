'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import PostCover from '../components/PostCover';
import ImageEditorDialog from './ImageEditorDialog';
import { uploadPhoto } from './ImageTools';
import './cover-picker.css';

type CoverStyle = 'stripes' | 'sun' | 'type' | 'landscape';
type ImageItem = { url: string; uploadedAt?: string };
type Props = {
  title: string;
  body: string;
  cover: CoverStyle;
  coverImage: string | null;
  coverTitle: boolean;
  coverTone: 'original' | 'newsprint';
  onChange: (value: { cover?: CoverStyle; coverImage?: string | null; coverTitle?: boolean; coverTone?: 'original' | 'newsprint' }) => void;
};
const styles: { value: CoverStyle; label: string }[] = [
  { value: 'stripes', label: '컬러 띠' }, { value: 'sun', label: '햇살' },
  { value: 'type', label: '활자' }, { value: 'landscape', label: '풍경' },
];
const mediaPattern = /\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp|gif)/giu;

export default function CoverPicker({ title, body, cover, coverImage, coverTitle, coverTone, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [editingCover, setEditingCover] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const candidates = Array.from(new Set([...(coverImage ? [coverImage] : []), ...Array.from(body.matchAll(mediaPattern), m => m[0]), ...images.map(image => image.url)]));

  async function loadImages(nextCursor?: string) {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/upload${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ''}`, { cache: 'no-store' });
      const payload = await response.json() as { images: ImageItem[]; cursor?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || '사진 목록을 불러오지 못했습니다.');
      if (!alive.current) return;
      setImages(previous => nextCursor ? [...previous, ...payload.images] : payload.images);
      setCursor(payload.cursor ?? null); setLoaded(true);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '사진 목록을 불러오지 못했습니다.'); }
    finally { if (alive.current) setLoading(false); }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('8MB 이하의 PNG, JPEG, WebP, GIF 사진을 골라 주세요.'); return;
    }
    setUploading(true); setError('');
    try {
      const data = new FormData(); data.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: data });
      const payload = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || (response.status === 413 ? '사진 용량이 업로드 한도를 넘었습니다. 8MB 이하의 사진을 골라 주세요.' : '사진을 올리지 못했습니다.'));
      if (!payload.url) throw new Error('사진 주소를 확인하지 못했습니다.');
      if (!alive.current) return;
      const uploadedUrl = payload.url;
      setImages(previous => [{ url: uploadedUrl }, ...previous]);
      onChange({ coverImage: payload.url });
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '사진을 올리지 못했습니다.'); }
    finally { if (alive.current) setUploading(false); }
  }

  return <section className="admin-card admin-cover-card cover-picker">
    <div className="admin-card-header admin-card-header-compact"><div><div className="admin-card-label">03 / 표지</div><h3>표지 선택</h3></div><span className="cover-picker-kind">{coverImage ? '사진' : '기본 디자인'}</span></div>
    <div className="cover-picker-preview"><PostCover title={title} cover={cover} coverImage={coverImage} coverTitle={coverTitle} coverTone={coverTone} /></div>
    <label className="cover-title-toggle"><input type="checkbox" checked={coverTitle} onChange={event => onChange({ coverTitle: event.target.checked })} /><span>표지 위에 제목 표시</span></label>
    {coverImage && <label className="cover-tone-field"><span>사진 표현</span><select value={coverTone} onChange={event => onChange({ coverTone: event.target.value as 'original' | 'newsprint' })}><option value="newsprint">신문 흑백</option><option value="original">원본 컬러</option></select></label>}
    <div className="cover-picker-actions">
      <button type="button" className="button button-secondary" onClick={() => { setOpen(!open); if (!open && !loaded && !loading) void loadImages(); }} aria-expanded={open}>{open ? '사진 목록 접기' : '올린 사진에서 고르기'}</button>
      <button type="button" className="button button-secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? '올리는 중…' : '표지 사진 올리기'}</button>
      {coverImage && <button type="button" className="button button-quiet" disabled={uploading} onClick={() => setEditingCover(coverImage)}>표지 사진 편집</button>}
      <input ref={fileRef} className="admin-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="표지 사진 업로드" onChange={upload} />
    </div>
    {error && <p className="cover-picker-error" role="alert">{error}</p>}
    {open && <div className="cover-library">
      <div className="cover-library-heading"><span>업로드한 사진</span><button type="button" disabled={loading} onClick={() => void loadImages()}>새로고침</button></div>
      <div className="cover-library-grid" role="group" aria-label="표지로 사용할 사진">
        {candidates.map((url, index) => <button type="button" key={url} className={coverImage === url ? 'selected' : ''} aria-pressed={coverImage === url} aria-label={`${index + 1}번 사진을 표지로 선택`} onClick={() => onChange({ coverImage: url })}><img src={url} alt="" loading="lazy" /><span>{coverImage === url ? '선택됨' : `사진 ${index + 1}`}</span></button>)}
      </div>
      {loading && <p role="status">사진을 불러오는 중…</p>}
      {!loading && loaded && !candidates.length && <p>아직 올린 사진이 없습니다. 위에서 사진을 올려 주세요.</p>}
      {cursor && <button type="button" className="cover-library-more" disabled={loading} onClick={() => void loadImages(cursor)}>사진 더 보기</button>}
    </div>}
    <p className="cover-picker-caption">기본 디자인으로 바꾸기</p>
    <div className="admin-cover-options" role="group" aria-label="기본 표지 디자인">
      {styles.map(style => <button key={style.value} type="button" aria-pressed={!coverImage && cover === style.value} className={`admin-cover-option admin-cover-option-${style.value} ${!coverImage && cover === style.value ? 'admin-cover-option-active' : ''}`} onClick={() => onChange({ cover: style.value, coverImage: null })}><span className="admin-cover-swatch" aria-hidden="true" /><span>{style.label}</span></button>)}
    </div>
    <p className="cover-picker-help">흑백 효과는 원본 사진을 바꾸지 않습니다. 글을 저장하면 표지 설정이 반영됩니다.</p>
    {editingCover && <ImageEditorDialog source={editingCover} filename={editingCover.split('/').pop()} onClose={() => setEditingCover(null)} onApply={async file => {
      const nextUrl = await uploadPhoto(file);
      if (!alive.current) return;
      setImages(previous => [{ url: nextUrl }, ...previous]);
      onChange({ coverImage: nextUrl });
      setEditingCover(null);
    }} />}
  </section>;
}
