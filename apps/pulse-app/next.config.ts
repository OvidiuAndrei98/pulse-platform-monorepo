import type { NextConfig } from "next";

const isMobileBuild = process.env.CAPACITOR_BUILD === "true";
const isStagingBranch = process.env.VERCEL_GIT_COMMIT_REF === "staging";
const stagingApiUrl = "https://api-staging.spottr.ro/api/v1";

const nextConfig: NextConfig = {
  output: isMobileBuild ? "export" : undefined,
  // Keep the explicit Vercel environment variable as the primary source. The
  // branch fallback is a safety net: a staging deployment must never silently
  // fall back to the production API when its Preview variable is mis-scoped.
  env: isStagingBranch && !process.env.NEXT_PUBLIC_API_URL
    ? { NEXT_PUBLIC_API_URL: stagingApiUrl }
    : undefined,
  images: {
    unoptimized: isMobileBuild,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.magnific.com",
        port: "",
        pathname: "/free-photo/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "guerrillaradio.b-cdn.net",
      },
      {
        protocol: "https",
        hostname: "api.spottr.ro",
        pathname: "/api/v1/media/**",
      },
      {
        protocol: "https",
        hostname: "api-staging.spottr.ro",
        pathname: "/api/v1/media/**",
      },
      {
        protocol: "https",
        hostname: "pulse-api.code-lab.ro",
        pathname: "/api/v1/media/**",
      },
    ],
  },
};

export default nextConfig;
