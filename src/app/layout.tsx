import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://liadelivery.com.br"),
  title: {
    default: "Lia — compras do dia a dia pelo WhatsApp",
    template: "%s · Lia"
  },
  description:
    "Manda a lista no WhatsApp, a Lia monta a cesta com preço fechado, você paga no Pix e recebe em casa no mesmo dia, no estado de São Paulo.",
  icons: {
    icon: "/brand/lia-icon.svg"
  },
  verification: {
    other: {
      "facebook-domain-verification": "1owcdre2qlyahhzap4d5jykwuc23sj"
    }
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://liadelivery.com.br",
    siteName: "Lia",
    title: "Lia — compras do dia a dia pelo WhatsApp",
    description:
      "Manda a lista, a Lia monta a cesta, você paga no Pix e recebe em casa no mesmo dia, no estado de São Paulo."
  }
};

export const viewport: Viewport = {
  themeColor: "#0F3D3A"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
