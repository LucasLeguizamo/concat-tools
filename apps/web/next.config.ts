import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servida bajo el sitio padre: onconcat.com/tools (rewrite en concat-site).
  basePath: "/tools",
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    // Sin middleware: "/tools" va al idioma por defecto (basePath se antepone solo).
    return [{ source: "/", destination: "/es", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
