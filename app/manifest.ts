import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "مدار | Madaar",
    short_name: "مدار",
    description: "مدار لإدارة جميع عمليات المنشأة من نظام واحد.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F9F8",
    theme_color: "#0E5755",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
