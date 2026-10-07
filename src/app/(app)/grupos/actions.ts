"use server";

import { publicDbMessage } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { assertCountLimit } from "@/lib/limits";
import { SCREENS } from "@/lib/screens";
import { GROUP_ACTIONS } from "@/lib/group-actions";
import { normalizeGroupColor, normalizeGroupIcon } from "@/lib/group-icons";

// Grupos entram no mesmo guard de Usuários (não têm código de permissão próprio no catálogo,
// quem administra pessoas administra as unidades operacionais que elas pertencem).
export async function createGroup(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome do grupo é obrigatório.");
  const supabase = await createClient();
  const { count: groupCount } = await supabase.from("groups").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId);
  await assertCountLimit(supabase, ctx.tenantId, "groups", "grupos", groupCount ?? 0);
  const { error } = await supabase.from("groups").insert({
    tenant_id: ctx.tenantId,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    icon: normalizeGroupIcon(formData.get("icon")),
    color: normalizeGroupColor(formData.get("color")),
    // Grupo novo nasce sem nenhuma ação liberada (todas as restrições ligadas, nenhuma permissão extra); o Administrador ativa
    // o que for necessário na aba Ações do grupo. Vale para toda ação nova que entrar no catálogo.
    disabled_actions: GROUP_ACTIONS.map((a) => a.key),
    granted_actions: [],
  });
  if (error) throw new Error(publicDbMessage(error));
  redirect("/grupos");
}

export async function updateGroup(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Nome do grupo é obrigatório.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("groups")
    .update({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      icon: normalizeGroupIcon(formData.get("icon")),
      color: normalizeGroupColor(formData.get("color")),
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);
  if (error) throw new Error(publicDbMessage(error));
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
  redirect(`/grupos/${id}`);
}

// Telas que membros Operador deste grupo veem no menu, Administrador nunca é afetado (ver
// getHiddenScreensForMember). O form manda os checkboxes marcados = visíveis; o que falta vira
// hidden_screens.
export async function updateGroupScreens(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id"));
  const visible = new Set(formData.getAll("visible").map(String));
  const hidden = SCREENS.map((s) => s.key).filter((key) => !visible.has(key));
  const supabase = await createClient();
  const { error } = await supabase.from("groups").update({ hidden_screens: hidden }).eq("id", id).eq("tenant_id", ctx.tenantId);
  if (error) throw new Error(publicDbMessage(error));
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
  redirect(`/grupos/${id}?aba=telas`);
}

// Ações que membros Operador deste grupo podem executar (ex.: lançar sinistro), Administrador
// nunca é afetado (ver isActionAllowedForMember). Mesmo padrão de updateGroupScreens: o form manda
// os checkboxes marcados = permitidos, o que falta vira disabled_actions.
export async function updateGroupActions(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id"));
  const allowed = new Set(formData.getAll("allowed").map(String));
  const disabled = GROUP_ACTIONS.map((a) => a.key).filter((key) => !allowed.has(key));
  // permissões extras que o grupo concede (catálogo fechado; o banco também confere)
  const granted = formData.getAll("granted").map(String).filter((k) => k === "financial.manage" || k === "financial.configure");
  const supabase = await createClient();
  const { error } = await supabase.from("groups").update({ disabled_actions: disabled, granted_actions: granted }).eq("id", id).eq("tenant_id", ctx.tenantId);
  if (error) throw new Error(publicDbMessage(error));
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
  revalidatePath("/sinistros");
  redirect(`/grupos/${id}?aba=acoes`);
}

// Grupo nunca é excluído: etapas e histórico apontam para ele (Documento 1 §2.3).
export async function toggleGroup(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id"));
  const next = formData.get("status") === "active" ? "inactive" : "active";
  const supabase = await createClient();
  const { error } = await supabase.from("groups").update({ status: next }).eq("id", id).eq("tenant_id", ctx.tenantId);
  if (error) throw new Error(publicDbMessage(error));
  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
}
