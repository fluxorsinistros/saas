import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileWarning, Plus, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";

export const metadata: Metadata = { title: "Sinistros" };

const CYCLE_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberto",
  in_progress: "Em andamento",
  waiting: "Aguardando",
  blocked: "Bloqueado",
  completed: "Concluído",
  cancelled: "Cancelado",
  discarded: "Descartado",
  archived: "Arquivado",
};

const CYCLE_STATUS_STYLE: Record<string, string> = {
  blocked: "bg-rose-50 text-rose-700 ring-rose-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  open: "bg-sky-50 text-sky-700 ring-sky-200",
  in_progress: "bg-sky-50 text-sky-700 ring-sky-200",
};

export default async function SinistrosPage({ searchParams }: { searchParams: Promise<{ grupo?: string; searched?: string }> }) {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);

  // Quem é Administrador vê e escolhe qualquer grupo (inclusive "Todos"); Operador só enxerga os
  // próprios grupos — grupo é conceito de Operador (decisão do usuário), igual à visibilidade de
  // menu em src/lib/screens.ts.
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id, membership_roles(roles(name))")
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .maybeSingle();
  const isAdmin = (membership?.membership_roles ?? []).some(
    (mr) => (mr as unknown as { roles: { name: string } | null }).roles?.name === "Administrador",
  );
  const { data: myGroupRows } = membership
    ? await supabase.from("group_members").select("groups(id, name, disabled_actions)").eq("membership_id", membership.id)
    : { data: [] as { groups: { id: string; name: string; disabled_actions: string[] } | null }[] };
  const myGroupsFull = (myGroupRows ?? [])
    .map((g) => g.groups)
    .filter((g): g is { id: string; name: string; disabled_actions: string[] } => !!g);
  const myGroups = myGroupsFull.map((g) => ({ id: g.id, name: g.name }));
  // Restrição adicional do grupo sobre claim.formalize (Documento 1 §32 + aba "Ações" do grupo):
  // Administrador nunca é afetado; Operador precisa de pelo menos um grupo que libere a ação.
  const canFormalize = isAdmin || myGroupsFull.some((g) => !g.disabled_actions.includes("claim.formalize"));

  const { data: allGroups } = isAdmin
    ? await supabase.from("groups").select("id, name").eq("tenant_id", ctx.tenantId).eq("status", "active").order("name")
    : { data: [] as { id: string; name: string }[] };
  const groupOptions = isAdmin ? allGroups ?? [] : myGroups;

  const sp = await searchParams;
  const requestedGroup = sp.grupo ?? "";
  // Operador sem grupo escolhido vê só o(s) próprio(s); "todos" só existe pra Administrador.
  const groupFilter = isAdmin
    ? requestedGroup === "todos"
      ? null
      : (groupOptions.find((g) => g.id === requestedGroup)?.id ?? null)
    : (groupOptions.find((g) => g.id === requestedGroup)?.id ?? groupOptions[0]?.id ?? null);

  // A listagem só consulta o banco depois de clicar "Filtrar" (campo oculto "searched") — abrir a
  // tela não carrega todos os sinistros + ciclos + atividades em aberto sozinha.
  const searched = sp.searched === "1";

  const { data: publishedWorkflows } = await supabase
    .from("workflows")
    .select("id, name, workflow_versions(status)")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active");

  let claims: { id: string; claim_number: string; status: string; created_at: string; claim_cycles: { id: string; status: string; cycle_number: number }[] }[] = [];
  let currentCycleByClaim = new Map<string, { id: string; status: string; cycle_number: number } | undefined>();
  const groupsByCycle = new Map<string, Set<string>>();
  let groupNameById = new Map<string, string>();
  let visibleClaims: typeof claims = [];

  if (searched) {
    const { data: claimRows } = await supabase
      .from("claims")
      .select("id, claim_number, status, created_at, claim_cycles(id, status, cycle_number)")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });
    claims = claimRows ?? [];

    // Grupo "responsável agora" = grupo da(s) atividade(s) em aberto do ciclo atual de cada
    // sinistro (pode ter mais de um em paralelo) — é isso que responde "o que está na fila do meu grupo".
    currentCycleByClaim = new Map(claims.map((c) => [c.id, [...c.claim_cycles].sort((a, b) => b.cycle_number - a.cycle_number)[0]]));
    const cycleIds = [...currentCycleByClaim.values()].filter(Boolean).map((c) => c!.id);
    const { data: openStages } = cycleIds.length
      ? await supabase.from("stage_instances").select("id, claim_cycle_id").in("claim_cycle_id", cycleIds).eq("status", "in_progress")
      : { data: [] as { id: string; claim_cycle_id: string }[] };
    const stageIds = (openStages ?? []).map((s) => s.id);
    const { data: openActivities } = stageIds.length
      ? await supabase.from("activity_instances").select("stage_instance_id, group_id").in("stage_instance_id", stageIds).in("status", ["not_started", "in_progress"])
      : { data: [] as { stage_instance_id: string; group_id: string | null }[] };
    const cycleOfStage = new Map((openStages ?? []).map((s) => [s.id, s.claim_cycle_id]));
    for (const a of openActivities ?? []) {
      if (!a.group_id) continue;
      const cycleId = cycleOfStage.get(a.stage_instance_id);
      if (!cycleId) continue;
      if (!groupsByCycle.has(cycleId)) groupsByCycle.set(cycleId, new Set());
      groupsByCycle.get(cycleId)!.add(a.group_id);
    }
    groupNameById = new Map(groupOptions.map((g) => [g.id, g.name]));

    visibleClaims = claims.filter((c) => {
      if (!groupFilter) return true;
      const cycle = currentCycleByClaim.get(c.id);
      return !!cycle && (groupsByCycle.get(cycle.id)?.has(groupFilter) ?? false);
    });
  }

  const options = (publishedWorkflows ?? []).filter((w) => w.workflow_versions.some((v) => v.status === "published"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Sinistros</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">
          Cada sinistro formalizado abre um ciclo preso à versão publicada do fluxo escolhido — mudanças futuras no fluxo não
          afetam ciclos já abertos.
        </p>

        {!perms.has("claim.formalize") || !canFormalize ? null : options.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-4 text-[13px] text-slate-500">
            Nenhum fluxo publicado ainda.{" "}
            <Link href="/fluxos" className="font-medium text-brand hover:underline">
              Publique um fluxo
            </Link>{" "}
            antes de abrir um sinistro.
          </div>
        ) : (
          <form action="/sinistros/novo" className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="workflow_id" className="mb-1 block text-[12px] font-medium text-slate-600">
                Fluxo publicado
              </label>
              <select
                id="workflow_id"
                name="fluxo"
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              >
                <option value="">Selecione…</option>
                {options.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Plus className="size-4" /> Formalizar sinistro
            </button>
          </form>
        )}

        {groupOptions.length > 0 && (
          <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <input type="hidden" name="searched" value="1" />
            <div className="min-w-[220px]">
              <label htmlFor="grupo" className="mb-1 block text-[12px] font-medium text-slate-600">
                Grupo responsável agora
              </label>
              <select
                id="grupo"
                name="grupo"
                defaultValue={isAdmin ? (groupFilter ?? "todos") : groupFilter ?? ""}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15"
              >
                {isAdmin && <option value="todos">Todos</option>}
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
              Filtrar
            </button>
          </form>
        )}

        {!searched ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <SearchX className="mx-auto size-8 text-slate-300" />
            <p className="text-[15px] font-medium text-slate-800">Clique em Filtrar para ver os sinistros</p>
            <p className="max-w-sm text-[13px] text-slate-500">A lista não carrega sozinha ao abrir a tela.</p>
          </div>
        ) : !visibleClaims.length ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FileWarning className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-medium text-slate-800">
              {claims?.length ? "Nenhum sinistro parado no grupo selecionado agora." : "Nenhum sinistro ainda"}
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {visibleClaims.map((c) => {
              const cycle = currentCycleByClaim.get(c.id);
              const status = cycle?.status ?? c.status;
              const activeGroups = cycle ? [...(groupsByCycle.get(cycle.id) ?? [])].map((id) => groupNameById.get(id)).filter(Boolean) : [];
              return (
                <li key={c.id}>
                  <Link href={`/sinistros/${c.id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                      <FileWarning className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-slate-900">{c.claim_number}</div>
                      {activeGroups.length > 0 && (
                        <div className="truncate text-[12px] text-slate-500">Aguardando: {activeGroups.join(", ")}</div>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        CYCLE_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {CYCLE_STATUS_LABEL[status] ?? status}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-300 transition group-hover:text-slate-500" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
