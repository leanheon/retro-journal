import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getSettings } from "../../lib/db";
import { renderMarkdown } from "../../lib/markdown";
import { blogOrigin } from "../../lib/env";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [post, settings] = await Promise.all([getPostBySlug(slug), getSettings()]);
  if (!post) return { title: `${settings.title} · 글을 찾을 수 없습니다` };

  const description = post.excerpt || post.body.replace(/\s+/gu, " ").slice(0, 160);
  const canonical = new URL(`/posts/${encodeURIComponent(post.slug)}`, blogOrigin()).toString();
  return {
    title: { absolute: `${post.title} · ${settings.title}` },
    description,
    alternates: { canonical },
    openGraph: {
      title: post.title,
      description,
      type: "article",
      url: canonical,
      publishedTime: post.publishedAt ?? post.createdAt,
      modifiedTime: post.updatedAt,
      authors: [settings.author],
      siteName: settings.title,
    },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const [post, settings] = await Promise.all([getPostBySlug(slug), getSettings()]);
  if (!post) notFound();

  const date = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long", timeZone: 'Asia/Seoul',
  }).format(new Date(post.publishedAt ?? post.createdAt));

  return (
    <main className="article-page" id="main">
      <header className="article-header">
        <Link className="article-brand" href="/">
          {settings.title}
        </Link>
        <nav aria-label="사이트 메뉴" className="article-nav">
          <Link href="/">홈</Link>
          <Link href="/admin">관리</Link>
        </nav>
      </header>

      <article className="article-shell">
        <div className={`article-cover cover-${post.cover}`} aria-hidden="true">
          <span>{post.category}</span>
        </div>
        <header className="article-title-block">
          <p className="article-kicker">
            {post.category} · {date}
          </p>
          <h1>{post.title}</h1>
          {post.excerpt ? <p className="article-excerpt">{post.excerpt}</p> : null}
          <div className="article-meta">
            <span>{settings.author}</span>
            {post.tags.length ? (
              <span aria-label="태그">{post.tags.map((tag) => `#${tag}`).join(" ")}</span>
            ) : null}
          </div>
        </header>
        <div className="article-body">{renderMarkdown(post.body)}</div>
      </article>

      <footer className="article-footer">
        <Link href="/">← 기록 목록으로</Link>
        <span>{settings.title} · {settings.author}</span>
      </footer>
    </main>
  );
}
