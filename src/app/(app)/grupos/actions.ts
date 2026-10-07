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

// ---------------------------------------------------------------- subgrupos
// O grupo liga os subgrupos (uma lista de nomes: transportadoras, seguradoras, "Operacional 1, 2 e 3") e decide se são obrigatórios.
// Estas ações devolvem a mensagem na tela em vez de lançar erro.
type SubState = { error: string | null; ok?: boolean; message?: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function saveSubgroupSettings(_prev: SubState, formData: FormData): Promise<SubState> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id") ?? "");
  const uses = formData.get("uses_subgroups") === "on";
  const required = formData.get("subgroup_required") === "on";
  if (required && !uses) return { error: "Para tornar o subgrupo obrigatório, ligue o uso de subgrupos neste grupo." };
  const supabase = await createClient();
  const { data: members } = await supabase.from("group_members").select("subgroup_id").eq("group_id", id);
  const withSub = (members ?? []).filter((m) => m.subgroup_id).length;
  if (!uses && withSub > 0) {
    return { error: `${withSub} ${withSub === 1 ? "pessoa está" : "pessoas estão"} em subgrupos deste grupo. Tire-${withSub === 1 ? "a" : "as"} dos subgrupos (em Usuários) antes de desligar.` };
  }
  const { data: updated, error } = await supabase
    .from("groups")
    .update({ uses_subgroups: uses, subgroup_required: required })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select("id");
  if (error) return { error: publicDbMessage(error) };
  if (!updated?.length) return { error: "Só o Administrador da empresa altera os subgrupos." };
  revalidatePath(`/grupos/${id}`);
  revalidatePath("/usuarios", "layout");
  const without = (members ?? []).length - withSub;
  return {
    error: null,
    ok: true,
    message: required && without > 0 ? `Salvo. ${without} ${without === 1 ? "pessoa deste grupo ainda está" : "pessoas deste grupo ainda estão"} sem subgrupo.` : "Salvo.",
  };
}

function readSubgroupFields(formData: FormData): { name: string; email: string | null } | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome do subgrupo." };
  if (name.length > 80) return { error: "O nome aceita no máximo 80 caracteres." };
  const email = String(formData.get("contact_email") ?? "").trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { error: "O e-mail de contato é inválido." };
  return { name, email: email || null };
}

export async function createSubgroup(_prev: SubState, formData: FormData): Promise<SubState> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const groupId = String(formData.get("group_id") ?? "");
  const f = readSubgroupFields(formData);
  if ("error" in f) return { error: f.error };
  const supabase = await createClient();
  const { data: group } = await supabase.from("groups").select("id, uses_subgroups").eq("id", groupId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!group) return { error: "Grupo não encontrado." };
  if (!group.uses_subgroups) return { error: "Ligue o uso de subgrupos neste grupo antes de cadastrar." };
  const { error } = await supabase.from("group_subgroups").insert({ tenant_id: ctx.tenantId, group_id: groupId, name: f.name, contact_email: f.email });
  if (error) return { error: error.code === "23505" ? "Já existe um subgrupo com esse nome neste grupo." : "Não foi possível cadastrar o subgrupo." };
  revalidatePath(`/grupos/${groupId}`);
  return { error: null, ok: true, message: `Subgrupo ${f.name} cadastrado.` };
}

export async function updateSubgroup(_prev: SubState, formData: FormData): Promise<SubState> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id") ?? "");
  const f = readSubgroupFields(formData);
  if ("error" in f) return { error: f.error };
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("group_subgroups")
    .update({ name: f.name, contact_email: f.email })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select("group_id");
  if (error) return { error: error.code === "23505" ? "Já existe um subgrupo com esse nome neste grupo." : "Não foi possível salvar o subgrupo." };
  if (!updated?.length) return { error: "Só o Administrador da empresa altera os subgrupos." };
  revalidatePath(`/grupos/${updated[0].group_id}`);
  return { error: null, ok: true };
}

// Subgrupo nunca é excluído: histórico e etapas apontam para ele. Inativo não aparece para novos vínculos.
export async function toggleSubgroup(formData: FormData) {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const id = String(formData.get("id"));
  const next = formData.get("status") === "active" ? "inactive" : "active";
  const supabase = await createClient();
  const { data: updated } = await supabase.from("group_subgroups").update({ status: next }).eq("id", id).eq("tenant_id", ctx.tenantId).select("group_id");
  if (updated?.[0]) revalidatePath(`/grupos/${updated[0].group_id}`);
}
