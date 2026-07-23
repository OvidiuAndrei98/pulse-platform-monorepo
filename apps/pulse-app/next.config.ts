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
    ],
  },
};

export default nextConfig;
