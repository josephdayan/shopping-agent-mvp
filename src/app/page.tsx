import Link from "next/link";
import { Bot, ClipboardList } from "lucide-react";
import ChatApp from "@/components/chat-app";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-ink/10 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-leaf text-white">
              <Bot size={19} />
            </span>
            Atlas
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-ink/15 bg-white px-3 py-2 text-sm font-medium hover:border-leaf"
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
