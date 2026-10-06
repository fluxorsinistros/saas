import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { PlatformBrandMark } from "@/components/PlatformBrandMark";
import {
  addGroupStep,
  createClaimTypeStep,
  finishOnboarding,
  inviteUserStep,
  renameGroupStep,
  setOperatingModel,
  skipToStep,
} from "./actions";

export const metadata: Metadata = { title: "Configurar empresa" };

// Documento 5 §3: wizard de 9 passos. Passos 3/6/7/8 do documento (escolher template, revisar,
// validar, publicar) colapsam num único checkpoint aqui, são literalmente a mesma tela (o Workflow
// Builder já tem o seletor de template, o painel de validação e o botão Publicar; reimplementar isso
// dentro do wizard duplicaria a peça principal do produto, e o Documento 5 §34 é explícito que o
// Builder é "a tela principal", tudo o resto é consumo do que ele produz).
const STEPS = [
  "Modelo operacional",
  "Tipos de sinistro",
  "Fluxo do processo",
  "Grupos",
  "Convidar usuários",
  "Primeiro sinistro",
];

const OPERATING_MODELS = [
  { value: "transportadora", label: "Transportadora" },
  { value: "embarcador", label: "Embarcador" },
  { value: "gerenciadora_risco", label: "Gerenciadora de risco" },
  { value: "corretora", label: "Corretora/Seguradora" },
  { value: "outro", label: "Outro" },
];

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export default async function OnboardingWizardPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, operating_model, onboarding_step, onboarding_completed_at")
    .eq("id", ctx.tenantId)
    .single();
  if (!tenant) redirect("/onboarding");
  if (tenant.onboarding_completed_at) redirect("/dashboard");

  const step = tenant.onboarding_step;

  const [{ data: claimTypes }, { data: groups }, { data: publishedWorkflows }, { count: memberCount }] = await Promise.all([
    supabase.from("claim_types").select("id, name").eq("tenant_id", ctx.tenantId),
    supabase.from("groups").select("id, name").eq("tenant_id", ctx.tenantId).eq("status", "active").order("name"),
    supabase.from("workflow_versions").select("id, workflows!inner(tenant_id)").eq("status", "published").eq("workflows.tenant_id", ctx.tenantId),
    supabase.from("tenant_memberships").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("status", "active"),
  ]);

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <PlatformBrandMark tone="light" />
        <h1 className="mt-6 text-[22px] font-semibold tracking-tight text-slate-900">Configurando {tenant.name}</h1>
        <p className="mt-1 text-[14px] text-slate-500">Poucos passos, cada um já fica salvo, dá pra sair e voltar depois.</p>

        <ol className="mt-6 flex flex-wrap gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const current = n === step;
            return (
              <li
                key={label}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${
                  current
                    ? "bg-brand text-white"
                    : done
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {done ? <Check className="size-3.5" /> : <span>{n}</span>}
                {label}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          {step === 1 && (
            <form action={setOperatingModel} className="space-y-4">
              <div>
                <h2 className="text-[15px] font-medium text-slate-900">Qual é o modelo operacional da empresa?</h2>
                <p className="mt-1 text-[13px] text-slate-500">Só para orientar sugestões depois, você pode mudar isso quando quiser.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {OPERATING_MODELS.map((m) => (
                  <label
                    key={m.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 has-[:checked]:border-brand has-[:checked]:bg-brand/5"
                  >
                    <input type="radio" name="operating_model" value={m.value} defaultChecked={m.value === "transportadora"} className="accent-[var(--color-brand)]" />
                    {m.label}
                  </label>
                ))}
              </div>
              <button className="rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600">Continuar</button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-[15px] font-medium text-slate-900">Quais tipos de sinistro vocês tratam?</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  Ex.: Roubo de carga, Avaria, Extravio. Cada tipo aqui vira uma categoria de sinistro, dá pra ajustar
                  depois.
                </p>
              </div>
              {(claimTypes ?? []).length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {(claimTypes ?? []).map((t) => (
                    <li key={t.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-700">
                      {t.name}
                    </li>
                  ))}
                </ul>
              )}
              <form action={createClaimTypeStep} className="flex items-end gap-2">
                <input name="name" required placeholder="Ex.: Roubo de carga" className={input} />
                <button className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
                  Adicionar
                </button>
              </form>
              <form action={skipToStep.bind(null, 3)}>
                <button className="text-[13px] font-medium text-brand hover:underline" disabled={(claimTypes ?? []).length === 0}>
                  Continuar
                </button>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-[15px] font-medium text-slate-900">Desenhe e publique o fluxo do processo</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  No Editor de Fluxo você escolhe um modelo pronto (ou começa do zero), revisa, valida e publica, é a tela
                  principal do produto. Volte aqui quando tiver ao menos um fluxo publicado.
                </p>
              </div>
              <Link
                href="/fluxos"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600"
              >
                Ir para o Editor de Fluxo
              </Link>
              <div>
                <form action={skipToStep.bind(null, 4)}>
                  <button
                    className="text-[13px] font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-slate-500"
                    disabled={(publishedWorkflows ?? []).length === 0}
                    title={(publishedWorkflows ?? []).length === 0 ? "Publique ao menos um fluxo para continuar" : undefined}
                  >
                    Já publiquei, continuar
                  </button>
                </form>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-[15px] font-medium text-slate-900">Confira os grupos operacionais</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  Já criamos alguns sugeridos. Renomeie o que fizer sentido, ou adicione outro.
                </p>
              </div>
              <ul className="space-y-1.5">
                {(groups ?? []).map((g) => (
                  <li key={g.id}>
                    <form action={renameGroupStep.bind(null, g.id)} className="flex items-center gap-2">
                      <input name="name" defaultValue={g.name} className={`${input} text-[13px]`} />
                      <button className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                        Salvar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={addGroupStep} className="flex items-end gap-2 border-t border-slate-100 pt-3">
                <input name="name" placeholder="Novo grupo" className={input} />
                <button className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
                  Adicionar
                </button>
              </form>
              <form action={skipToStep.bind(null, 5)}>
                <button className="text-[13px] font-medium text-brand hover:underline">Continuar</button>
              </form>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-[15px] font-medium text-slate-900">Convide quem mais vai usar</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  A pessoa precisa já ter uma conta (tela de login → Criar conta). Convite por e-mail para quem ainda não
                  tem conta é um passo futuro, {memberCount ?? 1} pessoa{(memberCount ?? 1) === 1 ? "" : "s"} no tenant até
                  agora.
                </p>
              </div>
              <form action={inviteUserStep} className="flex items-end gap-2">
                <input name="email" type="email" required placeholder="pessoa@empresa.com" className={input} />
                <button className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
                  Adicionar
                </button>
              </form>
              <form action={skipToStep.bind(null, 6)}>
                <button className="text-[13px] font-medium text-brand hover:underline">Pular por enquanto</button>
              </form>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-[15px] font-medium text-slate-900">Pronto, crie o primeiro sinistro</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  Isso fecha o ciclo: fluxo publicado, grupos configurados, gente convidada. O primeiro sinistro pode ser
                  agora ou depois, direto da tela de Sinistros.
                </p>
              </div>
              <Link
                href="/sinistros"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white hover:bg-brand-600"
              >
                Ir para Sinistros
              </Link>
              <div>
                <form action={finishOnboarding}>
                  <button className="text-[13px] font-medium text-slate-500 hover:text-slate-700 hover:underline">
                    Concluir configuração e ir para o Dashboard
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
