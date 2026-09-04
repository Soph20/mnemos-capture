import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xmu",
  applicationName: "Xmu",
  description: "A knowledge graph for your AI workers.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Xmu",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/favicon-32-light.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-32-dark.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/favicon-light.png", sizes: "192x192", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-dark.png", sizes: "192x192", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/apple-icon",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E4EDF6" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1120" },
  ],
};

const THEME_BOOT = `(function(){try{var t=localStorage.getItem("xmu-theme")||localStorage.getItem("mnemos-theme");if(t!=="dark"&&t!=="light")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <meta name="apple-mobile-web-app-title" content="Xmu" />
        <meta name="application-name" content="Xmu" />
      </head>
      <body>{children}</body>
    </html>
  );
}