import type { Metadata } from "next";
import "./globals.css";
import "@/components/atlas/atlas.css";

export const metadata: Metadata = {
  title: "Ocula — Atlas Oftalmologi Interaktif",
  description: "Jelajahi anatomi mata dalam 3D. Pelajari dinamika aqueous humor dan patogenesis katarak melalui model interaktif.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
