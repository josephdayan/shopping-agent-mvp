import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import ChatApp from "@/components/chat-app";
import LiaBrand from "@/components/lia-brand";
import { ADMIN_COOKIE, isAdminSession } from "@/lib/admin-auth";
import AdminLogin from "@/components/admin-login";

export const metadata: Metadata = {
  title: "Lia — demo",
  robots: { index: false }
};

export const dynamic = "force-dynamic";

export default function ChatDemo() {
  if (!isAdminSession(cookies().get(ADMIN_COOKIE)?.value)) {
    return <AdminLogin />;
  }
  return (
    <main className="min-h-screen">
      <header className="border-b border-lia-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <LiaBrand size="sm" />
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-lia-line bg-white px-3 py-2 text-sm font-semibold text-lia-night shadow-sm transition hover:border-lia-aqua hover:bg-lia-mint"
          >
            <ClipboardList size={16} />
            Admin
          </Link>
        </div>
      </header>
      <ChatApp />
    </main>
  );
}
