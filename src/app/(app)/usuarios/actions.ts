"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

export async function addMember(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) throw new Error("Informe um e-mail.");

  const { error } = await supabase.rpc("add_tenant_member", { p_tenant_id: ctx.tenantId, p_email: email });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}

// Sem tela de permissão granular ainda (Documento 1 §32) — qualquer membro pode ativar/desativar
// outro, igual ao resto do app hoje. Fica registrado aqui para não parecer decisão silenciosa.
export async function toggleMemberStatus(membershipId: string, currentStatus: string): Promise<void> {
  await getTenantContext();
  const supabase = await createClient();
  const next = currentStatus === "active" ? "inactive" : "active";
  const { error } = await supabase
    .from("tenant_memberships")
    .update({ status: next, left_at: next === "inactive" ? new Date().toISOString() : null })
    .eq("id", membershipId);
  if (error) throw new Error(error.message);
  revalidatePath("/usuarios");
}

export async function addMemberToGroup(formData: FormData): Promise<void> {
  await getTenantContext();
  const supabase = await createClient();
  const membershipId = String(formData.get("membership_id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!membershipId || !groupId) return;
  const { error } = await supabase.from("group_members").insert({ membership_id: membershipId, group_id: groupId });
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidatePath("/usuarios");
}

export async function removeMemberFromGroup(groupMemberId: string): Promise<void> {
  await getTenantContext();
  const supabase = await createClient();
  const { error } = await supabase.from("group_members").delete().eq("id", groupMemberId);
  if (error) throw new Error(error.message);
  revalidatePath("/usuarios");
}

const ROLE_KINDS = ["transportadora", "embarcador", "seguradora", "corretora", "gerenciadora_risco", "fornecedor", "outro"] as const;

export async function createOrganization(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const roleKind = String(formData.get("role_kind") ?? "outro");
  if (!name) throw new Error("Nome da organização é obrigatório.");
  const kind = (ROLE_KINDS as readonly string[]).includes(roleKind) ? roleKind : "outro";

  const { error } = await supabase.rpc("create_partner_organization", { p_tenant_id: ctx.tenantId, p_name: name, p_role_kind: kind });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}
