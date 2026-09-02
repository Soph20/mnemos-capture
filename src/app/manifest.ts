import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Xmu",
    short_name: "Xmu",
    description: "A knowledge graph for your AI workers",
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    lang: "en",
    background_color: "#E4EDF6",
    theme_color: "#E4EDF6",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
