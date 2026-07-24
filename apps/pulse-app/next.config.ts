import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
        hostname: "pulse-api.code-lab.ro",
        pathname: "/api/v1/media/**",
      },
    ],
  },
};

export default nextConfig;
