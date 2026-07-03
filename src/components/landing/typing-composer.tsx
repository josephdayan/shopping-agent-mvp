"use client";

import { useEffect, useState } from "react";

const LISTAS = [
  "arroz, feijão e creme dental",
  "cabo USB-C, pilhas e fone barato",
  "ração 15kg e areia de gato",
  "protetor solar e desodorante",
  "papel toalha, detergente e café"
];

const TYPE_MS = 55;
const ERASE_MS = 22;
const HOLD_MS = 1800;

export default function TypingComposer({ href }: { href: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(LISTAS[0]);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const run = (listIdx: number, charIdx: number, erasing: boolean) => {
      if (!alive) return;
      const lista = LISTAS[listIdx % LISTAS.length];
      if (!erasing) {
        setText(lista.slice(0, charIdx));
        if (charIdx < lista.length) {
          timer = setTimeout(() => run(listIdx, charIdx + 1, false), TYPE_MS);
        } else {
          timer = setTimeout(() => run(listIdx, charIdx, true), HOLD_MS);
        }
      } else {
        setText(lista.slice(0, charIdx));
        if (charIdx > 0) {
          timer = setTimeout(() => run(listIdx, charIdx - 1, true), ERASE_MS);
        } else {
          timer = setTimeout(() => run(listIdx + 1, 1, false), 350);
        }
      }
    };

    timer = setTimeout(() => run(0, 1, false), 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escrever sua lista pra Lia no WhatsApp"
      className="group flex w-full max-w-[560px] items-center gap-3"
    >
      <span className="flex h-14 flex-1 items-center overflow-hidden rounded-full bg-white px-6 text-left">
        <span className="truncate font-body text-[16px] text-lia-deep">
          {text}
          <span className="caret ml-0.5 inline-block h-[1.15em] w-[2px] translate-y-[0.2em] bg-lia-deep" aria-hidden="true" />
        </span>
      </span>
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white transition-colors group-hover:bg-[#1FBF5B]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6" fill="currentColor">
          <path d="M3.4 20.4 21.2 12 3.4 3.6l-.01 6.53L14 12 3.39 13.87Z" />
        </svg>
      </span>
    </a>
  );
}
