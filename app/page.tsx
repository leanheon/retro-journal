import Journal from './Journal';
import { getPublicPosts, getSettings } from './lib/db';
import { blogOrigin } from './lib/env';
export async function generateMetadata() {
  const settings = await getSettings();
  return { title: { absolute: `${settings.title} — ${settings.author}의 개인 블로그` }, description: settings.description, alternates: { canonical: blogOrigin() }, openGraph: {title: settings.title, description: settings.description, url: blogOrigin(), siteName: settings.title} };
}
export const dynamic = 'force-dynamic';
export default async function Home() {
  const [posts, settings] = await Promise.all([getPublicPosts(), getSettings()]);
  return <Journal initialPosts={posts} initialSettings={settings} />;
}
