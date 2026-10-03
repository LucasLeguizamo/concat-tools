import type { NextConfig } from "next";

// Anti-clickjacking en las paginas con botones de aprobacion (consent, device, connect, login).
const noFraming = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return ["/oauth/consent", "/device", "/connect/:path*", "/login"].map((source) => ({
      source,
      headers: noFraming,
    }));
  },
};

export default nextConfig;
