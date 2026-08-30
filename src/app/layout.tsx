import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mnemos",
  description: "Capture anything. Insights extracted automatically.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mnemos",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000820" },
    { media: "(prefers-color-scheme: light)", color: "#f0f4f8" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
