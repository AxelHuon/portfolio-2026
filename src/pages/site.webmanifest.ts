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
      icons: [icon(192), icon(512)],
    }),
    { headers: { "Content-Type": "application/manifest+json" } },
  );
