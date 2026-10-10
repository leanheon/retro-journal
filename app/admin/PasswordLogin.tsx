"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";

type LoginResponse = {
  ok?: boolean;
  error?: string;
};

export default function PasswordLogin() {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as LoginResponse;

      if (!response.ok || payload.ok !== true) {
        setError(payload.error || "비밀번호를 확인해 주세요.");
        setPending(false);
        return;
      }

      // A full navigation makes the new server cookie available to the page.
      window.location.assign("/admin");
    } catch {
      setError("관리 화면에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <main id="main" className="admin-gate admin-gate-signin password-auth-page">
      <div className="admin-gate-card password-auth-card">
        <span className="admin-gate-mark" aria-hidden="true">
          <img className="admin-signature-image" src="/images/author-signature.png" alt="" />
        </span>
        <p className="admin-eyebrow">블로그 관리 · 편집실</p>
        <h1>관리자 로그인</h1>
        <p className="password-auth-intro">
          비밀번호를 입력하면 글과 블로그 설정을 관리할 수 있습니다.
        </p>

        <form className="password-auth-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-password">편집실 비밀번호</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            maxLength={256}
            disabled={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "admin-password-error" : undefined}
          />
          {error ? (
            <p className="password-auth-error" id="admin-password-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button button-primary" type="submit" disabled={pending || !password}>
            {pending ? "확인하는 중…" : "편집실 들어가기"}
          </button>
        </form>

        <Link className="admin-gate-back" href="/" target="_top">블로그로 돌아가기</Link>
      </div>
    </main>
  );
}
