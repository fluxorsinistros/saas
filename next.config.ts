import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Upload do logo da marca (até 1 MB) passa por uma Server Action; o limite padrão é 1 MB no total.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
