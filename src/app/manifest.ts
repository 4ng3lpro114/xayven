import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "XAYVEN — Digital Studio",
    short_name: "XAYVEN",
    description: "Estudio digital de diseño y desarrollo web.",
    start_url: "/es",
    display: "standalone",
    background_color: "#07060a",
    theme_color: "#07060a",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
