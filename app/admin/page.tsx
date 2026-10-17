import type { Metadata } from "next";

import { getAdminUser } from "../lib/auth";
import AdminClient from "./AdminClient";
import PasswordLogin from "./PasswordLogin";
import "./admin.css";
import "./password-auth.css";
import "./writing-editor.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "블로그 관리 | 김지헌",
  description: "김지헌의 블로그 글과 설정을 관리합니다.",
};

export default async function AdminPage() {
  const user = await getAdminUser();

  if (!user) {
    return <PasswordLogin />;
  }

  return <AdminClient user={{ displayName: user.displayName }} />;
}
