import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getPlatformBrand } from "@/lib/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getPlatformBrand();
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: "Governança, execução e rastreabilidade do ciclo de sinistros.",
    // O ícone da aba é o logo da marca configurada em Administração (o padrão só entra se não houver logo).
    icons: { icon: brand.logoUrl ?? "/favicon.ico", apple: brand.logoUrl ?? undefined },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = (cookieStore.get("app_theme")?.value as "light" | "dark") || "light";

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${theme === "dark" ? "dark" : ""}`}
      data-theme={theme}
    >
      <body className={`h-full overflow-hidden font-sans ${theme === "dark" ? "dark" : ""}`}>{children}</body>
    </html>
  );
}
