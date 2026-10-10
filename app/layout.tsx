import type { Metadata } from 'next';
import './globals.css';
const origin = 'https://yeobaek-journal-epogo.sok78ksu94.chatgpt.site';
export const metadata: Metadata = {
 metadataBase: new URL(origin),
 title: { default: '내맘대로 살거야 — 김지헌의 개인 블로그', template: '%s · 내맘대로 살거야' },
 description: '김지헌의 일상, 생각, 좋아하는 것들을 적는 개인 블로그.',
 openGraph: { title: '내맘대로 살거야', description: '김지헌의 일상, 생각, 좋아하는 것들.', type: 'website', locale: 'ko_KR', url: origin },
 icons: { icon: '/favicon.svg' }, alternates: { types: { 'application/rss+xml': '/feed.xml' } },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
 return <html lang="ko"><body><a className="skip-link" href="#main">본문으로 건너뛰기</a>{children}</body></html>;
}
