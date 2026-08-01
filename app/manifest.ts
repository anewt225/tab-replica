import type { MetadataRoute } from "next";

/** Installable to the home screen — this is a thing people open at a table. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tab — split the check",
    short_name: "Tab",
    description:
      "Photograph a receipt, send everyone the link, and let each person tap what they had.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
