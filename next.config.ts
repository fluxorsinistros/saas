import type { NextConfig } from "next";

// Cabeçalhos de segurança em todas as rotas. CSP fica de fora de propósito: o Next injeta scripts inline e
// uma política restritiva sem nonce quebraria a aplicação, entra numa etapa própria, primeiro em modo Report-Only.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Upload do logo da marca (até 1 MB) passa por uma Server Action; o limite padrão é 1 MB no total.
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
