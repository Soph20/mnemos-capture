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
    { media: "(prefers-color-scheme: dark)", color: "#0F162F" },
    { media: "(prefers-color-scheme: light)", color: "#F5F0E6" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
