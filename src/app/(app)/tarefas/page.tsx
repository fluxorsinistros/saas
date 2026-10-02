import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { NODE_META, type NodeType } from "@/lib/workflow/types";
import { completeActivity } from "../sinistros/actions";

export const metadata: Metadata = { title: "Minhas tarefas" };

// Documento 5 §13 distingue "minhas tarefas" de "da minha equipe" por quem já tocou a atividade.
// O motor desta fatia não atribui atividade a uma pessoa (§5.3: responsável é o grupo, não a
// pessoa) — então as duas abas coincidem por enquanto. A 3ª aba ("Todas") mostra o tenant inteiro.
export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const scope = view === "all" ? "all" : "mine";
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("user_id", ctx.userId)
    .single();

  const { data: myGroupRows } = membership
    ? await supabase.from("group_members").select("group_id").eq("membership_id", membership.id)
    : { data: [] as { group_id: string }[] };
  const myGroupIds = (myGroupRows ?? []).map((g) => g.group_id);

  let query = supabase
    .from("activity_instances")
    .select("id, status, group_id, started_at, stage_instance_id")
    .eq("tenant_id", ctx.tenantId)
    .in("status", ["not_started", "in_progress"])
    .order("started_at", { ascending: true });
  if (scope === "mine") query = query.in("group_id", myGroupIds.length ? myGroupIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: activities } = await query;

  const stageIds = [...new Set((activities ?? []).map((a) => a.stage_instance_id))];
  const { data: stages } = stageIds.length
    ? await supabase.from("stage_instances").select("id, node_id, claim_cycle_id").in("id", stageIds)
    : { data: [] as { id: string; node_id: string; claim_cycle_id: string }[] };
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));

  const cycleIds = [...new Set((stages ?? []).map((s) => s.claim_cycle_id))];
  const { data: cycles } = cycleIds.length
    ? await supabase.from("claim_cycles").select("id, claim_id, status").in("id", cycleIds)
    : { data: [] as { id: string; claim_id: string; status: string }[] };
  const cycleById = new Map((cycles ?? []).map((c) => [c.id, c]));

  const claimIds = [...new Set((cycles ?? []).map((c) => c.claim_id))];
  const { data: claims } = claimIds.length
    ? await supabase.from("claims").select("id, claim_number").in("id", claimIds)
    : { data: [] as { id: string; claim_number: string }[] };
  const claimById = new Map((claims ?? []).map((c) => [c.id, c]));

  const nodeIds = [...new Set((stages ?? []).map((s) => s.node_id))];
  const { data: nodes } = nodeIds.length
    ? await supabase.from("workflow_nodes").select("id, name, node_type").in("id", nodeIds)
    : { data: [] as { id: string; name: string; node_type: string }[] };
  const nodeById = new Map((nodes ?? []).map((n) => [n.id, n]));

  const { data: groups } = await supabase.from("groups").select("id, name").eq("tenant_id", ctx.tenantId);
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));

  const rows = (activities ?? [])
    .map((a) => {
      const stage = stageById.get(a.stage_instance_id);
      const cycle = stage ? cycleById.get(stage.claim_cycle_id) : undefined;
      const claim = cycle ? claimById.get(cycle.claim_id) : undefined;
      const node = stage ? nodeById.get(stage.node_id) : undefined;
      if (!stage || !cycle || !claim || !node || cycle.status === "blocked" || cycle.status === "completed") return null;
      return { activity: a, claim, node, };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Minhas tarefas</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">
          Atividades em aberto nos grupos aos quais você pertence, de todos os sinistros.
        </p>

        <div className="mt-5 flex gap-1 border-b border-slate-200">
          <Tab href="/tarefas" active={scope === "mine"} icon={<Users className="size-3.5" />} label="Meus grupos" />
          <Tab href="/tarefas?view=all" active={scope === "all"} icon={<ClipboardList className="size-3.5" />} label="Todas" />
        </div>

        {rows.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <CheckCircle2 className="mx-auto size-8 text-slate-300" />
            <p className="mt-3 text-[15px] font-medium text-slate-800">Nenhuma tarefa em aberto</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {rows.map(({ activity, claim, node }) => (
              <li key={activity.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {NODE_META[node.node_type as NodeType]?.label ?? node.node_type}
                </span>
                <Link href={`/sinistros/${claim.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-slate-900 hover:underline">{node.name}</div>
                  <div className="truncate text-[12px] text-slate-500">
                    {claim.claim_number} · {groupName.get(activity.group_id ?? "") ?? "—"}
                  </div>
                </Link>
                {activity.status === "in_progress" ? (
                  <form action={completeActivity.bind(null, activity.id)}>
                    <button className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-brand-600">
                      Concluir
                    </button>
                  </form>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Não iniciada</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Tab({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition ${
        active ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
