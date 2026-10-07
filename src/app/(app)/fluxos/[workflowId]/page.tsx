import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { WorkflowBuilder } from "@/components/builder/WorkflowBuilder";
import type { WorkflowField } from "@/lib/workflow/types";

export const metadata: Metadata = { title: "Editor de fluxo" };

export default async function WorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { workflowId } = await params;
  const { v } = await searchParams;
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: workflow } = await supabase
    .from("workflows")
    .select("id, name, workflow_versions(id, version_number, status)")
    .eq("id", workflowId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!workflow) notFound();

  const versions = [...workflow.workflow_versions].sort((a, b) => b.version_number - a.version_number);
  const version =
    versions.find((x) => x.id === v) ?? versions.find((x) => x.status === "draft") ?? versions[0];
  if (!version) notFound();

  const [{ data: nodes }, { data: edges }, { data: groups }, { data: calendars }, { data: fields }] = await Promise.all([
    supabase
      .from("workflow_nodes")
      .select("id, node_type, name, group_id, config, position")
      .eq("workflow_version_id", version.id),
    supabase
      .from("workflow_edges")
      .select("id, from_node_id, to_node_id, edge_type, label, is_required")
      .eq("workflow_version_id", version.id)
      .order("order_index"),
    supabase.from("groups").select("id, name, uses_subgroups, group_subgroups(id, name, status)").eq("tenant_id", ctx.tenantId).eq("status", "active").order("name"),
    supabase.from("sla_calendars").select("id, name, business_start, business_end").eq("tenant_id", ctx.tenantId).order("name"),
    supabase
      .from("workflow_fields")
      .select("id, key, label, field_type, options, required, is_unique, default_value, min_length, max_length, min_value, max_value, formula, ref_group_id, multiple, position")
      .order("position")
      .eq("workflow_id", workflowId)
      .order("created_at"),
  ]);

  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  const { data: tenantRow } = await supabase.from("tenants").select("settings").eq("id", ctx.tenantId).maybeSingle();
  const defaultCalendarId = ((tenantRow?.settings as { sla?: { default_calendar_id?: string | null } } | null)?.sla?.default_calendar_id ?? null) as string | null;

  return (
    <WorkflowBuilder
      key={version.id}
      workflow={{ id: workflow.id, name: workflow.name }}
      version={version}
      versions={versions}
      initialNodes={nodes ?? []}
      initialEdges={edges ?? []}
      groups={(groups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        uses_subgroups: g.uses_subgroups,
        subgroups: (g.group_subgroups ?? []).filter((x) => x.status === "active").map((x) => ({ id: x.id, name: x.name })),
      }))}
      calendars={calendars ?? []}
      defaultCalendarId={defaultCalendarId}
      initialFields={(fields ?? []).map((f) => ({
        ...f,
        field_type: f.field_type as WorkflowField["field_type"],
        options: f.options as string[] | null,
      }))}
      canEdit={perms.has("workflow.edit")}
      canPublish={perms.has("workflow.publish")}
    />
  );
}
