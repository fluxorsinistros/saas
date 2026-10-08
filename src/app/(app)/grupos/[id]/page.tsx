import { GroupAppearancePicker } from "@/components/GroupAppearancePicker";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes, type PermissionCode } from "@/lib/permissions";
import { SCREENS } from "@/lib/screens";
import { GROUP_ACTIONS } from "@/lib/group-actions";
import { createSubgroup, saveSubgroupSettings, toggleGroup, toggleSubgroup, updateGroup, updateGroupActions, updateGroupScreens, updateSubgroup } from "../actions";
import { StateForm } from "@/components/StateForm";

export const metadata: Metadata = { title: "Editar grupo" };

const UUID = /^[0-9a-f-]{36}$/i;

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

const PERMISSION_LABELS: Record<PermissionCode, string> = {
  "claim.formalize": "Formalizar sinistro",
  "claim.execute": "Avançar etapas do sinistro",
  "claim.reopen": "Reabrir ciclo",
  "claim.discard": "Descartar ciclo",
  "document.validate": "Validar documentos",
  "workflow.edit": "Editar fluxos",
  "workflow.publish": "Publicar versão de fluxo",
  "import.confirm": "Confirmar importação em massa",
  "user.manage": "Gerenciar usuários e grupos",
  "financial.manage": "Gerenciar financeiro do ciclo",
  "financial.configure": "Configurar o painel financeiro",
  "sla.pause": "Pausar e retomar prazo",
};

const TABS = [
  { key: "geral", label: "Geral" },
  { key: "telas", label: "Telas" },
  { key: "acoes", label: "Ações" },
  { key: "subgrupos", label: "Subgrupos" },
] as const;

// Passo 3 do modelo (cadastrar → filtrar/listar → editar), igual a Usuários. Abas aqui porque mais
// configuração do grupo vem por aí (telas hoje, outras coisas depois), cada aba cuida de uma parte,
// em vez de empilhar tudo numa página só.
export default async function EditGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const ctx = await getTenantContext();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  if (!perms.has("user.manage")) redirect("/grupos");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const aba = TABS.find((t) => t.key === sp.aba)?.key ?? "geral";

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, description, status, icon, color, hidden_screens, disabled_actions, granted_actions, uses_subgroups, subgroup_required, group_members(count)")
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!group) notFound();

  const active = group.status === "active";
  const members = group.group_members?.[0]?.count ?? 0;
  const hiddenScreens = new Set(group.hidden_screens ?? []);
  const disabledActions = new Set(group.disabled_actions ?? []);
  const grantedActions = new Set(group.granted_actions ?? []);

  // Subgrupos do grupo e quantas pessoas há em cada um
  const [{ data: subgroups }, { data: memberSubs }] = await Promise.all([
    supabase.from("group_subgroups").select("id, name, contact_email, status").eq("group_id", id).order("name"),
    supabase.from("group_members").select("subgroup_id").eq("group_id", id),
  ]);
  const subCount = new Map<string, number>();
  for (const m of memberSubs ?? []) if (m.subgroup_id) subCount.set(m.subgroup_id, (subCount.get(m.subgroup_id) ?? 0) + 1);

  // Papel (Administrador/Operador) controla telas e ações, é escolhido por pessoa em /usuarios,
  // não por grupo. Mostrar aqui é só pra deixar claro a diferença, sem misturar os dois conceitos.
  const { data: roleRows } = await supabase
    .from("roles")
    .select("id, name, tenant_id, role_permissions(permissions(code))")
    .or(`tenant_id.is.null,tenant_id.eq.${ctx.tenantId}`)
    .in("name", ["Administrador", "Operador"]);
  const roles = ["Administrador", "Operador"].flatMap((name) => {
    const candidates = (roleRows ?? []).filter((r) => r.name === name);
    const chosen = candidates.find((r) => r.tenant_id === ctx.tenantId) ?? candidates[0];
    if (!chosen) return [];
    const codes = (chosen.role_permissions ?? [])
      .map((rp) => rp.permissions?.code)
      .filter((c): c is PermissionCode => !!c)
      .sort();
    return [{ name, codes }];
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div>
          <Link href="/grupos" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Grupos
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">{group.name}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {members} membro{members === 1 ? "" : "s"} · {active ? "Ativo" : "Inativo"}
          </p>
        </div>

        <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Abas do grupo">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "geral" ? `/grupos/${id}` : `/grupos/${id}?aba=${t.key}`}
              aria-current={t.key === aba ? "page" : undefined}
              className={`-mb-px rounded-t-lg border px-3.5 py-2 text-[13px] font-medium transition ${
                t.key === aba
                  ? "border-slate-200 border-b-slate-50 bg-slate-50 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {aba === "subgrupos" && (
          <section className="space-y-4">
            <StateForm action={saveSubgroupSettings} className="rounded-xl border border-slate-200 bg-white p-5">
              <input type="hidden" name="id" value={group.id} />
              <p className="text-[13px] text-slate-700">
                Subgrupos dividem este grupo em partes, como cada transportadora no grupo Transportador, ou Operacional 1, 2 e 3. As telas e as ações continuam as do
                grupo. Cada pessoa fica em um subgrupo por grupo.
              </p>
              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-2 text-[13px] text-slate-900">
                  <input type="checkbox" name="uses_subgroups" defaultChecked={group.uses_subgroups} className="mt-0.5 accent-[var(--color-brand)]" />
                  <span>
                    <span className="font-medium">Usar subgrupos neste grupo</span>
                    <span className="block text-[12px] text-slate-600">Liga a lista de subgrupos e a escolha do subgrupo ao cadastrar a pessoa.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[13px] text-slate-900">
                  <input type="checkbox" name="subgroup_required" defaultChecked={group.subgroup_required} className="mt-0.5 accent-[var(--color-brand)]" />
                  <span>
                    <span className="font-medium">Subgrupo obrigatório</span>
                    <span className="block text-[12px] text-slate-600">Toda pessoa colocada neste grupo precisa estar em um subgrupo.</span>
                  </span>
                </label>
              </div>
              <button className="mt-4 cursor-pointer rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-600">Salvar</button>
            </StateForm>

            {group.uses_subgroups && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="text-[14px] font-semibold text-slate-900">Subgrupos de {group.name}</h2>
                {(subgroups ?? []).length === 0 ? (
                  <p className="mt-2 text-[13px] text-slate-700">Nenhum subgrupo ainda. Cadastre o primeiro abaixo.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {(subgroups ?? []).map((sg) => (
                      <li key={sg.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[14px] font-medium text-slate-900">{sg.name}</span>
                            <span className="ml-2 text-[12px] text-slate-600">
                              {subCount.get(sg.id) ?? 0} {(subCount.get(sg.id) ?? 0) === 1 ? "pessoa" : "pessoas"}
                              {sg.contact_email ? ` · ${sg.contact_email}` : ""}
                            </span>
                            {sg.status !== "active" && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">Inativo</span>}
                          </div>
                          <form action={toggleSubgroup}>
                            <input type="hidden" name="id" value={sg.id} />
                            <input type="hidden" name="status" value={sg.status} />
                            <button className="cursor-pointer text-[12px] font-medium text-brand hover:underline">{sg.status === "active" ? "Desativar" : "Ativar"}</button>
                          </form>
                        </div>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[12px] font-medium text-brand hover:underline">Editar</summary>
                          <StateForm action={updateSubgroup} className="mt-2 flex flex-wrap items-end gap-2" successMessage="Subgrupo salvo.">
                            <input type="hidden" name="id" value={sg.id} />
                            <div className="min-w-[180px] flex-1">
                              <label htmlFor={`sg-name-${sg.id}`} className="mb-1 block text-[12px] font-medium text-slate-600">Nome</label>
                              <input id={`sg-name-${sg.id}`} name="name" required maxLength={80} defaultValue={sg.name} className={input} />
                            </div>
                            <div className="min-w-[180px] flex-1">
                              <label htmlFor={`sg-mail-${sg.id}`} className="mb-1 block text-[12px] font-medium text-slate-600">E-mail de contato (opcional)</label>
                              <input id={`sg-mail-${sg.id}`} name="contact_email" type="email" defaultValue={sg.contact_email ?? ""} className={input} />
                            </div>
                            <button className="cursor-pointer rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white hover:bg-brand-600">Salvar</button>
                          </StateForm>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}

                <StateForm action={createSubgroup} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                  <input type="hidden" name="group_id" value={group.id} />
                  <div className="min-w-[180px] flex-1">
                    <label htmlFor="new-sg-name" className="mb-1 block text-[12px] font-medium text-slate-600">Novo subgrupo</label>
                    <input id="new-sg-name" name="name" required maxLength={80} placeholder="Ex.: TecPet" className={input} />
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <label htmlFor="new-sg-mail" className="mb-1 block text-[12px] font-medium text-slate-600">E-mail de contato (opcional)</label>
                    <input id="new-sg-mail" name="contact_email" type="email" placeholder="contato@empresa.com.br" className={input} />
                  </div>
                  <button className="cursor-pointer rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-white hover:bg-brand-600">Cadastrar</button>
                </StateForm>
              </div>
            )}
          </section>
        )}

        {aba === "geral" && (
          <>
            <form action={updateGroup} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <input type="hidden" name="id" value={group.id} />
              <div>
                <label htmlFor="name" className="mb-1 block text-[12px] font-medium text-slate-600">
                  Nome
                </label>
                <input id="name" name="name" required defaultValue={group.name} className={input} />
              </div>
              <div>
                <label htmlFor="description" className="mb-1 block text-[12px] font-medium text-slate-600">
                  Descrição <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <input id="description" name="description" defaultValue={group.description ?? ""} className={input} />
              </div>
              <GroupAppearancePicker icon={group.icon} color={group.color} />
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
                Salvar alterações
              </button>
            </form>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Papéis e permissões</h2>
              <p className="mb-3 flex items-start gap-1.5 text-[12px] text-slate-500">
                <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
<span>                Quais ações cada pessoa pode executar é controlado pelo <strong>Papel</strong> dela, não pelo grupo. O papel é
                escolhido por pessoa em{" "}
                <Link href="/usuarios" className="text-brand hover:underline">
                  Usuários
                </Link>
                .</span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {roles.map((r) => (
                  <div key={r.name} className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-1.5 text-[13px] font-medium text-slate-900">{r.name}</p>
                    <ul className="space-y-0.5">
                      {r.codes.map((c) => (
                        <li key={c} className="text-[12px] text-slate-600">
                          {PERMISSION_LABELS[c] ?? c}
                        </li>
                      ))}
                      {r.codes.length === 0 && <li className="text-[12px] text-slate-500">Nenhuma permissão.</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Situação</h2>
              <p className="mb-3 text-[12px] text-slate-500">
                Grupo nunca é excluído, etapas e histórico já publicados continuam apontando para ele. Desativar só impede que
                ele seja escolhido em novos fluxos ou cadastros de usuário.
              </p>
              <form action={toggleGroup}>
                <input type="hidden" name="id" value={group.id} />
                <input type="hidden" name="status" value={group.status} />
                <button
                  className={`rounded-lg px-4 py-2 text-[13px] font-medium ring-1 ring-inset transition ${
                    active
                      ? "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100"
                      : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                  }`}
                >
                  {active ? "Desativar grupo" : "Reativar grupo"}
                </button>
              </form>
            </section>
          </>
        )}

        {aba === "telas" && (
          <form action={updateGroupScreens} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <input type="hidden" name="id" value={group.id} />
            <div>
              <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Telas visíveis no menu</h2>
              <p className="mb-3 flex items-start gap-1.5 text-[12px] text-slate-500">
                <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
<span>                Vale só para quem é <strong>Operador</strong> e está neste grupo, Administrador sempre vê o menu inteiro,
                independentemente do grupo. Desmarcar uma tela não revoga nenhuma ação, só tira o item do menu lateral.</span>
              </p>
            </div>
            <ul className="space-y-2">
              {SCREENS.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`screen-${s.key}`}
                    name="visible"
                    value={s.key}
                    defaultChecked={!hiddenScreens.has(s.key)}
                    className="size-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                  />
                  <label htmlFor={`screen-${s.key}`} className="text-[14px] text-slate-800">
                    {s.label}
                  </label>
                </li>
              ))}
            </ul>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              Salvar telas
            </button>
          </form>
        )}

        {aba === "acoes" && (
          <form action={updateGroupActions} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <input type="hidden" name="id" value={group.id} />
            <div>
              <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Ações permitidas</h2>
              <p className="mb-3 flex items-start gap-1.5 text-[12px] text-slate-500">
                <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
<span>                Vale só para quem é <strong>Operador</strong> e está neste grupo, Administrador sempre pode fazer tudo,
                independentemente do grupo. É uma restrição a mais sobre o que o Papel já libera, não substitui permissão.</span>
              </p>
            </div>
            <ul className="space-y-2">
              {GROUP_ACTIONS.map((a) => (
                <li key={a.key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id={`action-${a.key}`}
                    name="allowed"
                    value={a.key}
                    defaultChecked={!disabledActions.has(a.key)}
                    className="mt-0.5 size-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                  />
                  <label htmlFor={`action-${a.key}`}>
                    <span className="block text-[14px] text-slate-800">{a.label}</span>
                    <span className="block text-[12px] text-slate-500">{a.hint}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 pt-4">
              <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Permissões extras do grupo</h2>
              <p className="mb-3 flex items-start gap-1.5 text-[12px] text-slate-500">
                <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
                <span>
                  O Operador deste grupo ganha estas permissões além do papel dele, enquanto estiver atuando neste grupo. Todas vêm desligadas: ligue só o necessário. Administrador já pode tudo.
                </span>
              </p>
              <ul className="space-y-2">
                {[
                  { key: "financial.manage", label: "Salvar os valores do painel financeiro", hint: "Preencher e salvar os campos editáveis da aba Financeiro do sinistro." },
                  { key: "financial.configure", label: "Configurar o painel financeiro", hint: "Escolher quais campos aparecem, a ordem, o rótulo, o destaque e se são editáveis. Criar ou excluir campos continua com o Administrador." },
                  { key: "claim.reopen", label: "Reabrir ciclo", hint: "Reabrir um sinistro concluído para continuar o trabalho. Desligado por padrão." },
                  { key: "claim.discard", label: "Descartar e reiniciar ciclo", hint: "Descartar o ciclo atual e abrir outro do zero, com motivo. Ação de alto impacto: desligado por padrão." },
                  { key: "sla.pause", label: "Pausar e retomar o prazo da etapa", hint: "Suspender a contagem do prazo de uma etapa (com motivo) e retomar depois. O prazo final é empurrado pelo tempo pausado." },
                ].map((a) => (
                  <li key={a.key} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id={`granted-${a.key}`}
                      name="granted"
                      value={a.key}
                      defaultChecked={grantedActions.has(a.key)}
                      className="mt-0.5 size-4 rounded border-slate-300 text-brand focus:ring-brand/30"
                    />
                    <label htmlFor={`granted-${a.key}`}>
                      <span className="block text-[14px] text-slate-800">{a.label}</span>
                      <span className="block text-[12px] text-slate-500">{a.hint}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              Salvar ações
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
