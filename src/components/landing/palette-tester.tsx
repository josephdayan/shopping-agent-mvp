"use client";

import { useEffect, useState } from "react";

// Ferramenta de DEV pra escolher a paleta da landing ao vivo (não renderiza em produção).
// Troca as 4 variáveis de cor do tema; o botão verde-WhatsApp dos CTAs é fixo de propósito.
type Palette = {
  name: string;
  poster: string; // fundo das seções escuras
  tinta: string; // texto nas seções claras
  papel: string; // fundo das seções claras
  acento: string; // destaque ("zap.", sublinhados)
};

const PALETTES: Palette[] = [
  { name: "Verde WhatsApp (atual)", poster: "7 94 84", tinta: "10 42 40", papel: "228 243 239", acento: "40 254 229" },
  { name: "Petróleo (original)", poster: "11 42 51", tinta: "11 33 40", papel: "243 242 237", acento: "45 212 191" },
  { name: "Grafite & creme", poster: "30 35 34", tinta: "26 29 28", papel: "246 242 234", acento: "255 209 102" },
  { name: "Marinho & manteiga", poster: "20 33 61", tinta: "22 32 51", papel: "247 245 239", acento: "255 209 102" },
  { name: "Café da esquina", poster: "62 42 26", tinta: "43 28 18", papel: "250 244 235", acento: "255 179 92" },
  { name: "Berinjela & lima", poster: "58 34 94", tinta: "34 22 51", papel: "247 244 251", acento: "217 255 91" }
];

const STORAGE_KEY = "lia-palette-test";

function apply(p: Palette) {
  const root = document.documentElement.style;
  root.setProperty("--c-poster", p.poster);
  root.setProperty("--c-tinta", p.tinta);
  root.setProperty("--c-papel", p.papel);
  root.setProperty("--c-acento", p.acento);
}

export default function PaletteTester() {
  const [active, setActive] = useState(PALETTES[0].name);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const palette = PALETTES.find((p) => p.name === saved);
    if (palette) {
      setActive(palette.name);
      apply(palette);
    }
  }, []);

  const pick = (p: Palette) => {
    setActive(p.name);
    localStorage.setItem(STORAGE_KEY, p.name);
    apply(p);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-[230px] rounded-xl border border-black/15 bg-white/95 p-3 text-[13px] shadow-2xl backdrop-blur">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between font-bold">
        <span>🎨 Testar paleta</span>
        <span>{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {PALETTES.map((p) => (
            <button
              key={p.name}
              onClick={() => pick(p)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-black/5 ${
                active === p.name ? "bg-black/10 font-semibold" : ""
              }`}
            >
              <span className="flex shrink-0 overflow-hidden rounded-full border border-black/20">
                <span className="h-4 w-4" style={{ background: `rgb(${p.poster})` }} />
                <span className="h-4 w-4" style={{ background: `rgb(${p.papel})` }} />
                <span className="h-4 w-4" style={{ background: `rgb(${p.acento})` }} />
              </span>
              {p.name}
            </button>
          ))}
          <p className="pt-1 text-[11px] leading-snug text-black/50">
            Clica e olha a página inteira. Me diz o nome da vencedora.
          </p>
        </div>
      )}
    </div>
  );
}
