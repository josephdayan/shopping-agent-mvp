import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://liadelivery.com.br"),
  title: {
    default: "Lia — compras do dia a dia pelo WhatsApp",
    template: "%s · Lia"
  },
  description:
    "Pede qualquer coisa no WhatsApp, a Lia mostra o total com frete e prazo, você paga por Pix ou cartão e recebe em casa, no estado de São Paulo.",
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
    siteName: "Lia Delivery",
    title: "Lia — compras do dia a dia pelo WhatsApp",
    description:
      "Pede qualquer coisa, a Lia mostra o total com frete e prazo, você paga por Pix ou cartão e recebe em casa, no estado de São Paulo."
  }
};

export const viewport: Viewport = {
  themeColor: "#075E54"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
