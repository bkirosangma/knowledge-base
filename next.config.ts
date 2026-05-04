import type { NextConfig } from "next";

// GitHub Pages deploys the site under `/knowledge-base/` (the repo name).
// `GITHUB_PAGES=true` is set by the Pages workflow; locally and on Vercel
// the app keeps serving from root.
const isPages = process.env.GITHUB_PAGES === "true";
const basePath = isPages ? "/knowledge-base" : "";

const nextConfig: NextConfig = {
  devIndicators: false,
  ...(isPages && {
    output: "export",
    basePath,
    images: { unoptimized: true },
    trailingSlash: true,
  }),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
