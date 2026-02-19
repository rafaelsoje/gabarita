import type { Metadata } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Gabarita",
  description: "Sistema de gestão de estudos",
  icons: {
    icon: "/brand/logo-gabarita-mark.svg",
    shortcut: "/brand/logo-gabarita-mark.svg",
    apple: "/brand/logo-gabarita-mark.svg"
  },
  openGraph: {
    title: "Gabarita",
    description: "Sistema de gestão de estudos",
    type: "website",
    locale: "pt_BR",
    siteName: "Gabarita",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Gabarita - Planeje. Estude. Gabarite."
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Gabarita",
    description: "Sistema de gestão de estudos",
    images: ["/twitter-image"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
