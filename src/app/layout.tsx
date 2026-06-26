import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Concierge de compras com IA via WhatsApp e API",
  icons: {
    icon: "/brand/atlas-icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
