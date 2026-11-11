/* Manifeste généré depuis src/data/site.ts : le nom et la couleur ne sont écrits qu'à un endroit */
import type { APIRoute } from "astro";
import { site } from "../data/site";

const icon = (size: number) => ({ src: `/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png" });

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: site.name,
      short_name: site.name,
      start_url: "/",
      display: "browser",
      background_color: site.themeColor,
      theme_color: site.themeColor,
      icons: [
        icon(192),
        icon(512),
        // le logo dans la zone sûre (80 %) : Android le découpe à sa forme (cercle, carré arrondi)
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }),
    { headers: { "Content-Type": "application/manifest+json" } },
  );
