import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { isActionAllowedForMember } from "@/lib/group-actions";
import { loadGraph } from "@/lib/workflow/load-graph";
import { formalizeClaim } from "../actions";

export const metadata: Metadata = { title: "Novo sinistro" };

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

// Documento 1: campos de abertura vêm do elemento "Início" do fluxo escolhido, configurado no
// Builder, por isso essa tela só existe depois de escolher o fluxo (cada um pode pedir campos
// diferentes), em vez de um formulário fixo igual pra todo mundo.
export default async function NovoSinistroPage({ searchParams }: { searchParams: Promise<{ fluxo?: string }> }) {
  const ctx = await getTenantContext();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  if (!perms.has("claim.formalize")) redirect("/sinistros");
  if (!(await isActionAllowedForMember(ctx.userId, ctx.tenantId, "claim.formalize"))) redirect("/sinistros");

  const { fluxo } = await searchParams;
  if (!fluxo) redirect("/sinistros");

  const supabase = await createClient();
  const { data: workflow } = await supabase
    .from("workflows")
    .select("id, name, workflow_versions(id, status)")
    .eq("id", fluxo)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!workflow) notFound();
  const published = workflow.workflow_versions.find((v) => v.status === "published");
  if (!published) redirect("/sinistros");

  const graph = await loadGraph(supabase, published.id);
  const startNode = graph.nodes.find((n) => n.type === "start");
  const fieldKeys = startNode?.config.field_keys ?? [];

  const { data: fields } = fieldKeys.length
    ? await supabase
        .from("workflow_fields")
        .select("id, key, label, field_type, options, required, default_value, min_length, max_length")
        .eq("workflow_id", workflow.id)
        .in("key", fieldKeys)
        .order("position")
    : { data: [] as { id: string; key: string; label: string; field_type: string; options: unknown; required: boolean; default_value: string | null; min_length: number | null; max_length: number | null }[] };

  const needsPeople = (fields ?? []).some((f) => f.field_type === "person");
  let memberOptions: { id: string; name: string }[] = [];
  if (needsPeople) {
    const { data: memberRows } = await supabase
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "active");
    const ids = (memberRows ?? []).map((m) => m.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("user_profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string }[] };
    memberOptions = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || p.id }));
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div>
          <Link href="/sinistros" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Sinistros
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">Novo sinistro: {workflow.name}</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-700">
            {(fields ?? []).length === 0
              ? "Este fluxo não pede nenhum campo na abertura, formalize e preencha o que for preciso nas próprias etapas."
              : "Campos definidos no elemento Início deste fluxo."}
          </p>
        </div>

        <form action={formalizeClaim} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <input type="hidden" name="workflow_id" value={workflow.id} />
          {(fields ?? []).length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {(fields ?? []).map((f) => (
                <div key={f.id}>
                  <label htmlFor={`field-${f.key}`} className="mb-1 block text-[12px] font-medium text-slate-600">
                    {f.label}
                    {f.required && <span className="text-rose-600"> *</span>}
                  </label>
                  {f.field_type === "select" ? (
                    <select id={`field-${f.key}`} name={`field_${f.key}`} required={f.required} defaultValue={f.default_value ?? ""} className={input}>
                      <option value="">Selecione…</option>
                      {((f.options as string[] | null) ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : f.field_type === "boolean" ? (
                    <select id={`field-${f.key}`} name={`field_${f.key}`} required={f.required} defaultValue={f.default_value ?? ""} className={input}>
                      <option value="">Selecione…</option>
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  ) : f.field_type === "person" ? (
                    <select id={`field-${f.key}`} name={`field_${f.key}`} required={f.required} defaultValue={f.default_value ?? ""} className={input}>
                      <option value="">Selecione…</option>
                      {memberOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  ) : f.field_type === "textarea" ? (
                    <textarea id={`field-${f.key}`} name={`field_${f.key}`} rows={3} required={f.required} minLength={f.min_length ?? undefined} maxLength={f.max_length ?? undefined} defaultValue={f.default_value ?? ""} className={input} />
                  ) : f.field_type === "attachment" ? (
                    <input id={`field-${f.key}`} name={`field_${f.key}`} type="file" required={f.required} className={input} />
                  ) : (
                    <input
                      id={`field-${f.key}`}
                      name={`field_${f.key}`}
                      type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                      required={f.required}
                      minLength={f.field_type === "text" ? (f.min_length ?? undefined) : undefined}
                      maxLength={f.field_type === "text" ? (f.max_length ?? undefined) : undefined}
                      defaultValue={f.default_value ?? ""}
                      className={input}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
            <Plus className="size-4" /> Formalizar sinistro
          </button>
        </form>
      </div>
    </div>
  );
}
