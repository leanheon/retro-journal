'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowRight, Search, X, ArrowDown, Rss, Menu } from 'lucide-react';
import { DEFAULT_SETTINGS } from './lib/defaults';
import type { Post, SiteSettings } from './lib/types';
import './journal.css';
import PostCover from './components/PostCover';

const categories = ['전체', '일상', '생각', '취향', '만들기'];
const date = (value: string) => new Date(value).toLocaleDateString('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
}).replace(/\. /g, '.').replace(/\.$/, '');

function PrintMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <path d="M18 1v34M1 18h34M6 6l24 24M6 30 30 6" stroke="currentColor" strokeWidth="2" />
    <circle cx="18" cy="18" r="6" fill="var(--paper)" stroke="currentColor" strokeWidth="2" />
    <circle cx="18" cy="18" r="2" fill="currentColor" />
  </svg>;
}

function FoldedBands() {
  return <svg className="folded-bands" viewBox="0 0 520 520" aria-hidden="true">
    <path fill="#476150" d="M46 0h51v214l262 255v51h-51L46 265Z" />
    <path fill="#a6ab8f" d="M97 0h51v214l262 255v51h-51L97 265Z" />
    <path fill="#d9c792" d="M148 0h51v214l262 255v51h-51L148 265Z" />
    <path fill="#bc6c4d" d="M199 0h51v214l262 255v51h-51L199 265Z" />
    <path fill="#24271f" fillOpacity=".11" d="M46 214h204v51H46ZM308 469h204v51H308Z" />
  </svg>;
}

export default function Journal({ initialPosts, initialSettings }: { initialPosts: Post[]; initialSettings: SiteSettings }) {
  const posts = initialPosts;
  const settings = { ...DEFAULT_SETTINGS, ...initialSettings };
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const filtered = useMemo(() => posts.filter(post =>
    (category === '전체' || post.category === category) &&
    `${post.title} ${post.excerpt} ${post.body} ${post.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()),
  ), [posts, category, search]);
  const featured = posts.find(post => post.featured && !post.isSample);
  const countFor = (cat: string) => cat === '전체' ? posts.length : posts.filter(post => post.category === cat).length;
  const jump = (cat: string) => {
    setCategory(cat);
    setMenuOpen(false);
    document.getElementById('archive')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return <div className="journal-shell">
    <div className="press-edition"><span>{settings.author}의 개인 블로그</span><span>일상과 생각, 좋아하는 것들</span><a href="/feed.xml">RSS로 읽기 <Rss size={11} /></a></div>
    <header className="press-header">
      <a href="/" className="press-wordmark" aria-label={`${settings.title} 홈`}><PrintMark /><span>{settings.title}</span></a>
      <nav id="journal-nav" className={menuOpen ? 'press-nav is-open' : 'press-nav'} aria-label="주 메뉴">
        <a href="#archive" onClick={() => setMenuOpen(false)}><small>01</small> 글 목록</a>
        <a href="#about" onClick={() => setMenuOpen(false)}><small>02</small> 쓰는 사람</a>
      </nav>
      <div className="press-header-actions">
        <button className="press-icon-button" onClick={() => setSearchOpen(!searchOpen)} aria-label={searchOpen ? '검색 닫기' : '글 검색'} aria-controls="journal-search-panel" aria-expanded={searchOpen}>{searchOpen ? <X size={21} /> : <Search size={21} />}</button>
        <button className="press-icon-button press-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'} aria-controls="journal-nav" aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
    </header>
    {searchOpen && <form className="press-search" id="journal-search-panel" onSubmit={event => { event.preventDefault(); jump('전체'); }}>
      <label htmlFor="journal-search">글 검색</label>
      <div><input autoFocus id="journal-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="제목, 내용, 태그" type="search" /><button type="submit">찾기 <ArrowRight size={18} /></button></div>
    </form>}

    <main id="main">
      <section className="journal-hero" aria-labelledby="hero-title">
        <div className="journal-hero-copy">
          <span className="press-label">{settings.author}의 개인 기록</span>
          <h1 id="hero-title" className="journal-hero-title" lang="en">LIFE<br /><span>IN NOTES.</span></h1>
          <div className="hero-note"><span className="hero-note-number" aria-hidden="true">✳</span><p>{settings.description}</p></div>
          <a className="press-read-link" href="#archive">남겨 둔 글 보기 <span><ArrowDown size={20} /></span></a>
        </div>
        <figure className="journal-hero-art" aria-hidden="true">
          <FoldedBands />
          <span className="typewriter-seal" aria-hidden="true">기록<br />중</span>
          <img className="typewriter-illustration" src="/images/typewriter-cutout.png" alt="" draggable={false} />
          <figcaption><span>일상 · 생각 · 취향 · 만들기</span><span>{settings.author} 씀</span></figcaption>
        </figure>
      </section>

      <div className="press-ornament" aria-hidden="true"><span /><i>✦</i><span /></div>

      {featured && <section className="press-featured" aria-labelledby="featured-title">
        <a className="press-featured-cover" href={`/posts/${featured.slug}`} tabIndex={-1} aria-hidden="true"><PostCover {...featured} /></a>
        <div className="press-featured-copy">
          <div className="press-section-kicker"><span>골라 둔 글</span><span>{featured.category}</span></div>
          <h2 id="featured-title"><a href={`/posts/${featured.slug}`}>{featured.title}</a></h2>
          <p>{featured.excerpt}</p>
          <a className="press-featured-link" href={`/posts/${featured.slug}`}>{date(featured.publishedAt ?? featured.createdAt)} · {Math.max(1, Math.ceil(featured.body.length / 500))}분 읽기 <ArrowUpRight size={26} /></a>
        </div>
      </section>}

      <section className="journal-archive" id="archive" aria-labelledby="archive-title">
        <div className="press-section-heading"><div><span className="press-section-index">01 / 기록</span><h2 id="archive-title">남겨 둔 글.</h2></div><span className="press-total">모두 <strong>{posts.length}</strong>편</span></div>
        <div className="press-categories" role="group" aria-label="카테고리 필터">
          {categories.map((cat, index) => <button key={cat} className={category === cat ? 'is-active' : ''} onClick={() => setCategory(cat)} aria-pressed={category === cat} aria-label={`${cat} ${countFor(cat)}편`}><span className="category-index">0{index + 1}</span><span className="category-name">{cat}</span><small>{countFor(cat)}</small><ArrowUpRight size={19} /></button>)}
        </div>
        <div className="journal-content-grid">
          <div className="press-posts">
            <div className="press-list-heading"><span>{category === '전체' ? '전체 글' : `${category}에 관한 글`}<small>{filtered.length}편</small></span><button onClick={() => { setSearchOpen(true); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }} aria-label="글 검색 열기">글 찾기 <Search size={15} /></button></div>
            {search && <div className="press-search-summary">“{search}” 검색 결과 <button onClick={() => setSearch('')}>지우기 <X size={13} /></button></div>}
            {filtered.length ? <div className="press-post-list">{filtered.map((post, index) => <article className="press-entry" key={post.id}>
              <span className="entry-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <a className="press-cover" href={`/posts/${post.slug}`} aria-label={`${post.title} 읽기`}><PostCover {...post} /></a>
              <div className="entry-copy"><div className="entry-kicker"><span>{post.category}</span><time dateTime={post.publishedAt ?? post.createdAt}>{date(post.publishedAt ?? post.createdAt)}</time></div><h3><a href={`/posts/${post.slug}`}>{post.title}<ArrowUpRight size={25} /></a></h3><p>{post.excerpt}</p><div className="entry-tags">{post.tags.map(tag => <button key={tag} onClick={() => { setSearch(tag); setCategory('전체'); }}>#{tag}</button>)}</div></div>
            </article>)}</div> : <div className="press-empty"><span aria-hidden="true">—</span><h3>{search || category !== '전체' ? '해당하는 글이 없습니다.' : '아직 올린 글이 없습니다.'}</h3>{(search || category !== '전체') && <button onClick={() => { setSearch(''); setCategory('전체'); }}>전체 글 보기 <ArrowRight size={16} /></button>}</div>}
            <div className="press-list-end"><span>{filtered.length > 0 ? '여기까지 읽으셨습니다.' : '다른 분류도 살펴보세요.'}</span><span aria-hidden="true">끝.</span></div>
          </div>

          <aside className="journal-about" id="about" aria-labelledby="about-title">
            <span className="press-section-index">02 / 쓰는 사람</span>
            <div className="about-author-line">
              <h2 id="about-title">{settings.author}</h2>
              <img className="author-signature" src="/images/author-signature.png" alt={`${settings.author} 서명`} />
            </div>
            <p>{settings.bio}</p>
            <div className="about-rule" aria-hidden="true"><span /><i>✳</i></div>
            <dl><div><dt>이곳은</dt><dd>개인 블로그</dd></div><div><dt>쓰는 주제</dt><dd>일상 · 생각 · 취향 · 만들기</dd></div></dl>
            <a className="about-rss" href="/feed.xml">새 글은 RSS로 <ArrowUpRight size={20} /></a>
            <div className="about-color-bars" aria-hidden="true"><i /><i /><i /><i /></div>
          </aside>
        </div>
      </section>

      <section className="press-subscribe" aria-label="RSS 구독">
        <div><span className="press-label">가끔 들러도 좋고, 구독해도 좋고.</span><p>새 글은 RSS로 받아볼 수 있습니다.</p></div>
        <a href="/feed.xml">RSS 구독 <ArrowUpRight strokeWidth={1.7} /></a>
      </section>
    </main>

    <footer className="press-footer">
      <a className="press-footer-brand" href="/">{settings.author}의 기록<span>© {new Date().getFullYear()} {settings.author}</span></a>
      <div><a href="/admin">블로그 관리 <ArrowUpRight size={13} /></a><a href="#main">맨 위로 <ArrowUpRight size={13} /></a></div>
    </footer>
    <div className="press-bottom-stripes" aria-hidden="true"><i /><i /><i /><i /></div>
  </div>;
}
