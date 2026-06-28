import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lia",
  description: "Sua assistente de compras por WhatsApp e API",
  icons: {
    icon: "/brand/lia-icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
