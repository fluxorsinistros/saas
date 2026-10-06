import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { PANEL_FIELD_TYPES, readPanel } from "@/lib/financial-panel";
import { FIELD_TYPE_LABEL, type FieldType } from "@/lib/workflow/types";
import { PanelEditor } from "./PanelEditor";

export const metadata: Metadata = { title: "Painel financeiro do fluxo" };

export default async function FinancialPanelPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const [{ data: workflow }, { data: fields }, perms] = await Promise.all([
    supabase.from("workflows").select("id, name, financial_panel").eq("id", workflowId).eq("tenant_id", ctx.tenantId).maybeSingle(),
    supabase.from("workflow_fields").select("id, key, label, field_type, formula, min_value, max_value, default_value").eq("workflow_id", workflowId).in("field_type", PANEL_FIELD_TYPES).order("position"),
    getPermissionCodes(ctx.userId, ctx.tenantId),
  ]);
  if (!workflow) notFound();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow space-y-5 px-4 py-6 md:px-8 md:py-8">
        <Link href={`/fluxos/${workflow.id}`} className="inline-flex items-center gap-1 text-[13px] text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" /> Voltar ao editor
        </Link>
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Painel financeiro: {workflow.name}</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-700">
            Monte o painel da aba Financeiro: crie, edite e exclua campos, escolha quais aparecem, a ordem, o rótulo, o destaque e se a
            pessoa pode preencher ou só consultar. Vale para todos os sinistros deste fluxo, inclusive os já abertos.
          </p>
        </div>
        <PanelEditor
          workflowId={workflow.id}
          canEdit={perms.has("workflow.edit")}
          fields={(fields ?? []).map((f) => ({ ...f, typeLabel: FIELD_TYPE_LABEL[f.field_type as FieldType] ?? f.field_type }))}
          initial={readPanel(workflow.financial_panel)}
        />
      </div>
    </div>
  );
}
