import type { ReactNode } from "react";
import PostCover from "./PostCover";
import { renderMarkdown } from "../lib/markdown";

export type NewspaperArticlePost = {
  title: string;
  body: string;
  excerpt: string;
  category: string;
  tags: string[];
  cover: string;
  coverImage?: string | null;
  coverTitle?: boolean;
  coverTone?: "original" | "newsprint";
  createdAt?: string;
  publishedAt?: string | null;
};

export type NewspaperArticleSettings = {
  title: string;
  author: string;
};

type NewspaperArticleProps = {
  post: NewspaperArticlePost;
  settings: NewspaperArticleSettings;
  preview?: boolean;
};

function formatDate(value?: string | null): { label: string; iso: string | undefined } {
  if (!value) return { label: "작성일 미정", iso: undefined };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { label: value, iso: undefined };
  return {
    label: new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "long",
      timeZone: "Asia/Seoul",
    }).format(parsed),
    iso: value,
  };
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="article-meta">
      <span className="article-meta-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export default function NewspaperArticle({
  post,
  settings,
  preview = false,
}: NewspaperArticleProps) {
  const date = formatDate(post.publishedAt ?? post.createdAt);
  const readingMinutes = Math.max(1, Math.ceil(post.body.trim().length / 500));
  const coverTone = post.coverTone === "original" ? "original" : "newsprint";
  const articleClass = `newspaper-article newspaper-cover-tone-${coverTone}${preview ? " newspaper-article-preview" : ""}`;

  return (
    <div className={articleClass}>
      {preview ? (
        <div className="newspaper-preview-banner" role="status">
          미리보기 · 아직 저장되지 않은 내용
        </div>
      ) : null}

      <article className="article-shell">
        <div className="article-photo-cover newspaper-cover">
          <PostCover
            title={post.title}
            cover={post.cover}
            coverImage={post.coverImage}
            coverTitle={post.coverTitle}
            coverTone={coverTone}
            className={`newspaper-post-cover newspaper-post-cover-${coverTone}`}
          />
        </div>

        <header className="article-title-block">
          <div className="article-title-main">
            <p className="article-kicker">
              {post.category} / {date.label}
            </p>
            <h1>{post.title || "제목 없는 글"}</h1>
            {post.excerpt ? <p className="article-excerpt">{post.excerpt}</p> : null}
          </div>

          <div className="article-meta-panel">
            <MetaRow label="쓴 사람"><strong>{settings.author}</strong></MetaRow>
            <MetaRow label="쓴 날">
              <time dateTime={date.iso}>{date.label}</time>
            </MetaRow>
            <MetaRow label="읽는 시간">{readingMinutes}분</MetaRow>
            {post.tags.length ? (
              <div className="article-meta article-tags" aria-label="태그">
                {post.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            ) : null}
          </div>
        </header>

        <div className="article-divider" aria-hidden="true"><span>✳</span></div>

        <div className="article-body">
          {post.body.trim() ? renderMarkdown(post.body) : <p className="article-empty-body">본문을 입력하면 여기에 표시됩니다.</p>}
        </div>

        <div className="article-signature" aria-label={`${settings.author}의 서명`}>
          <span className="article-signature-rule" aria-hidden="true" />
          <img
            src="/images/author-signature.png"
            alt={`${settings.author} 서명`}
            width="112"
            height="48"
            loading="lazy"
          />
          <span className="article-signature-name">{settings.author}</span>
        </div>
      </article>
    </div>
  );
}
