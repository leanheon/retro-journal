import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getSettings } from "../../lib/db";
import { blogOrigin } from "../../lib/env";
import "../article.css";
import NewspaperArticle from "../../components/NewspaperArticle";

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
      ...(post.coverImage ? { images: [{ url: new URL(post.coverImage, blogOrigin()).toString(), alt: post.title }] } : {}),
    },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const [post, settings] = await Promise.all([getPostBySlug(slug), getSettings()]);
  if (!post) notFound();

  return (
    <main className="article-page" id="main">
      <header className="article-header article-masthead">
        <div className="article-masthead-top">
          <Link className="article-brand" href="/">
            {settings.title}
          </Link>
          <span className="article-issue">개인 기록 / {post.category}</span>
          <nav aria-label="사이트 메뉴" className="article-nav">
            <Link href="/">홈</Link>
            <Link href="/admin">관리</Link>
          </nav>
        </div>
        <div className="article-masthead-rule" aria-hidden="true" />
      </header>

      <NewspaperArticle post={post} settings={settings} />

      <footer className="article-footer">
        <Link href="/">← 기록 목록</Link>
        <span>{settings.title} / {settings.author}</span>
      </footer>
    </main>
  );
}
