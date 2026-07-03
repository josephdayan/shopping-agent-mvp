import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Lia — compras do dia a dia sem sair do WhatsApp";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadDisplayFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&display=swap"
    ).then((r) => r.text());
    const match = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/);
    if (!match) return null;
    return await fetch(match[1]).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OgImage() {
  const displayFont = await loadDisplayFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px 0",
          backgroundColor: "#082523",
          fontFamily: displayFont ? "Bricolage" : "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="64" height="64" viewBox="0 0 100 100">
            <polyline
              points="38,25 38,72 71,72"
              fill="none"
              stroke="#28FEE5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="16"
            />
            <path d="M74 16 Q74 30 88 30 Q74 30 74 44 Q74 30 60 30 Q74 30 74 16 Z" fill="#28FEE5" />
          </svg>
          <div style={{ fontSize: 52, fontWeight: 800, color: "#FFFFFF" }}>Lia</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1.02, color: "#FFFFFF", letterSpacing: -2 }}>
            Acabou em casa?
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 92,
              fontWeight: 800,
              lineHeight: 1.02,
              color: "#FFFFFF",
              letterSpacing: -2
            }}
          >
            <span>Manda um</span>
            <span style={{ display: "flex", marginLeft: 24, color: "#28FEE5" }}>zap.</span>
          </div>
          <div style={{ marginTop: 30, fontSize: 27, color: "rgba(255,255,255,0.72)", fontWeight: 400 }}>
            Lista, preço fechado, Pix e entrega hoje — tudo sem sair do WhatsApp
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            padding: "22px 0 26px",
            fontSize: 24
          }}
        >
          <span style={{ color: "#28FEE5" }}>liadelivery.com.br</span>
          <span style={{ color: "rgba(255,255,255,0.55)" }}>São Paulo · entrega no mesmo dia</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: displayFont
        ? [{ name: "Bricolage", data: displayFont, weight: 800 as const, style: "normal" as const }]
        : undefined
    }
  );
}
