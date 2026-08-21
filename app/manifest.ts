import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "تِجرا | TIJRA",
    short_name: "تِجرا",
    description: "منصة التجارة الذكية بين المورد وتاجر التجزئة.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#0F4D4D",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
