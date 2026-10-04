import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    // Sin middleware: "/" va al idioma por defecto.
    // Rutas del sitio anterior (concat-site): /tools era el basePath; blog, founders y paginas de agencia se retiraron.
    const retired = ["/blog", "/blog/:path*", "/founders/:path*", "/planes", "/nosotros", "/portfolio/:path*", "/contact", "/gateway"];
    return [
      { source: "/", destination: "/es", permanent: false },
      { source: "/tools", destination: "/es", permanent: true },
      { source: "/tools/:path*", destination: "/:path*", permanent: true },
      ...retired.map((source) => ({ source, destination: "/es", permanent: true })),
    ];
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
