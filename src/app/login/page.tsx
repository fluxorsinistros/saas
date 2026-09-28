import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <FlowBackdrop />
        <BrandMark tone="dark" />
        <div className="relative max-w-md">
          <p className="text-[34px] font-semibold leading-[1.15] tracking-tight">
            Do evento à resolução, <span className="text-cyan">cada etapa rastreada.</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
            Fluxos configuráveis com decisões, ramos paralelos, convergências e SLAs — com histórico completo de quem fez o quê
            e quando.
          </p>
        </div>
        <p className="relative text-[12px] text-slate-500">Governança · Execução · Rastreabilidade</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <BrandMark tone="light" />
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}

// Grafo decorativo: bifurcação e convergência, a ideia central do produto.
function FlowBackdrop() {
  return (
    <svg className="pointer-events-none absolute -right-40 top-1/2 h-[560px] -translate-y-1/2 opacity-[0.22]" viewBox="0 0 420 560" aria-hidden>
      <g fill="none" stroke="#22d3ee" strokeWidth="1.5">
        <path d="M210 40 V140" />
        <path d="M210 170 C 210 210, 90 200, 90 250" />
        <path d="M210 170 V250" />
        <path d="M210 170 C 210 210, 330 200, 330 250" />
        <path d="M90 300 C 90 350, 210 340, 210 390" strokeDasharray="5 5" />
        <path d="M210 300 V390" />
        <path d="M330 300 C 330 350, 210 340, 210 390" />
        <path d="M210 420 V520" />
      </g>
      <g fill="#0b1220" stroke="#2563eb" strokeWidth="1.5">
        <rect x="160" y="10" width="100" height="30" rx="8" />
        <rect x="40" y="250" width="100" height="50" rx="10" />
        <rect x="160" y="250" width="100" height="50" rx="10" />
        <rect x="280" y="250" width="100" height="50" rx="10" />
        <rect x="160" y="520" width="100" height="30" rx="15" />
      </g>
      <g fill="#0b1220" stroke="#7c3aed" strokeWidth="1.5">
        <polygon points="210,140 240,155 210,170 180,155" />
      </g>
      <rect x="150" y="390" width="120" height="30" rx="15" fill="#0b1220" stroke="#22d3ee" strokeWidth="1.5" />
    </svg>
  );
}
