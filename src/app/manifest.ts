import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mnemos",
    short_name: "Mnemos",
    description: "Capture anything. Insights extracted automatically.",
    start_url: "/",
    display: "standalone",
    background_color: "#efeef3",
    theme_color: "#efeef3",
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
