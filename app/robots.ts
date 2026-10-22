import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env";

// Never disallow /_next/: Google needs the JS/CSS to render the pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", getSiteUrl()).toString(),
  };
}
