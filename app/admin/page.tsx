import type { Metadata } from "next";
import Link from "next/link";

import { getChatGPTUser } from "../chatgpt-auth";
import { isBlogOwnerEmail } from "../lib/auth";
import AdminClient from "./AdminClient";
import "./admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "기록실 관리 | 김지헌",
  description: "김지헌의 개인 블로그 관리자 기록실",
};

export default async function AdminPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main id="main" className="admin-gate admin-gate-signin">
        <div className="admin-gate-card">
          <span className="admin-gate-mark" aria-hidden="true">KJ</span>
          <p className="admin-eyebrow">PRIVATE EDITOR / 01</p>
          <h1>기록실은 주인만 열 수 있어요.</h1>
          <p>김지헌의 ChatGPT 계정으로 로그인하면 글을 쓰고 블로그를 정리할 수 있습니다.</p>
          <a className="button button-primary" href="/signin-with-chatgpt?return_to=/admin" target="_top">
            ChatGPT로 로그인
          </a>
          <Link className="admin-gate-back" href="/" target="_top">블로그로 돌아가기</Link>
        </div>
      </main>
    );
  }

  if (!isBlogOwnerEmail(user.email)) {
    return (
      <main id="main" className="admin-gate admin-gate-denied">
        <div className="admin-gate-card">
          <span className="admin-gate-mark admin-gate-mark-denied" aria-hidden="true">!</span>
          <p className="admin-eyebrow">PRIVATE EDITOR / 403</p>
          <h1>이 계정에는 편집 권한이 없습니다.</h1>
          <p>로그인한 계정 {user.email}은 이 기록실의 소유자로 등록되어 있지 않습니다.</p>
          <Link className="button button-primary" href="/" target="_top">블로그로 돌아가기</Link>
        </div>
      </main>
    );
  }

  return <AdminClient user={{ displayName: user.displayName, email: user.email }} />;
}

