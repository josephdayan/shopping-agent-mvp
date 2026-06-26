import Link from "next/link";
import { ClipboardList } from "lucide-react";
import ChatApp from "@/components/chat-app";
import AtlasBrand from "@/components/atlas-brand";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-atlas-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <AtlasBrand size="sm" />
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-atlas-line bg-white px-3 py-2 text-sm font-semibold text-atlas-night shadow-sm transition hover:border-atlas-violet hover:text-atlas-violet"
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
