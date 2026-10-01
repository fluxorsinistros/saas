"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { assertCountLimit } from "@/lib/limits";
import { sendInviteMail, sendResetMail } from "@/lib/auth-mail";

export type AccessState = { ok: boolean; message: string } | null;

const INVITE_NOTE =
  "Convite registrado, sem e-mail. A pessoa cria a conta com este e-mail (tela de login → Criar conta); no primeiro acesso ela entra na empresa com o tipo e o grupo definidos.";

async function activeUserCount(tenantId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("tenant_memberships")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  return count ?? 0;
}

// Novo usuário da empresa, pelo Administrador: quem já tem conta entra na hora; quem não tem vira convite
// (com e-mail, se marcado). Erros voltam como mensagem, porque lançar erro vira texto genérico em produção.
export async function addUser(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const roleId = String(formData.get("role_id") ?? "");
  const sendMail = formData.get("send_invite") === "on";
  if (!email || !roleId) return { ok: false, message: "Informe o e-mail e o tipo." };

  try {
    await assertCountLimit(supabase, ctx.tenantId, "users", "usuários", await activeUserCount(ctx.tenantId));
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Limite do plano atingido." };
  }

  const { data, error } = await supabase.rpc("tenant_add_user", {
    p_tenant_id: ctx.tenantId,
    p_email: email,
    p_role_id: roleId,
    p_group_id: String(formData.get("group_id") ?? "") || null,
    p_full_name: String(formData.get("full_name") ?? "").trim() || null,
    p_phone: String(formData.get("phone") ?? "").trim() || null,
    p_cpf: String(formData.get("cpf") ?? "").trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  const orgId = String(formData.get("organization_id") ?? "");
  if (orgId) {
    const { error: orgError } = await supabase.rpc("set_person_organization", { p_tenant_id: ctx.tenantId, p_email: email, p_organization_id: orgId });
    if (orgError) return { ok: false, message: orgError.message };
  }
  revalidatePath("/usuarios");

  if (data === "added") return { ok: true, message: "Usuário adicionado. Ele já pode entrar na empresa." };
  if (!sendMail) return { ok: true, message: INVITE_NOTE };
  const mailError = await sendInviteMail(email);
  return mailError
    ? { ok: true, message: `Convite registrado, mas o e-mail não foi enviado: ${mailError} Use "Reenviar convite" na lista.` }
    : {
        ok: true,
        message: `Convite registrado e e-mail enviado para ${email}. A pessoa digita o código de 6 dígitos recebido em /confirmar-convite para criar a senha.`,
      };
}

// Tipo, grupo e situação de um membro, por um Administrador da conta. As regras ficam no banco
// (tenant_update_member): ninguém altera o próprio acesso, Gestor não aparece, Administrador não fica em grupo.
export async function updateMemberAccess(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const supabase = await createClient();
  const membershipId = String(formData.get("membership_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  const active = formData.get("active") === "on";
  if (!membershipId || !roleId) return { ok: false, message: "Escolha o tipo." };

  // Reativar consome uma vaga de usuário do plano
  const { data: current } = await supabase.from("tenant_memberships").select("status").eq("id", membershipId).maybeSingle();
  if (active && current?.status !== "active") {
    try {
      await assertCountLimit(supabase, ctx.tenantId, "users", "usuários", await activeUserCount(ctx.tenantId));
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Limite do plano atingido." };
    }
  }

  const { error } = await supabase.rpc("tenant_update_member", {
    p_membership_id: membershipId,
    p_role_id: roleId,
    p_group_id: String(formData.get("group_id") ?? "") || null,
    p_active: active,
  });
  if (error) return { ok: false, message: error.message };
  const orgId = String(formData.get("organization_id") ?? "");
  if (orgId) {
    const { data: who } = await supabase.from("tenant_memberships").select("user_profiles(email)").eq("id", membershipId).maybeSingle();
    const email = (who as unknown as { user_profiles: { email: string } | null } | null)?.user_profiles?.email;
    if (email) {
      const { error: orgError } = await supabase.rpc("set_person_organization", { p_tenant_id: ctx.tenantId, p_email: email, p_organization_id: orgId });
      if (orgError) return { ok: false, message: orgError.message };
    }
  }
  revalidatePath("/usuarios");
  return { ok: true, message: "Usuário salvo." };
}

// Envia ao usuário (da própria empresa, que não seja o próprio Administrador) o link para redefinir a senha.
export async function sendResetToMember(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const supabase = await createClient();
  const membershipId = String(formData.get("membership_id") ?? "");
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("user_id")
    .eq("id", membershipId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!membership) return { ok: false, message: "Usuário não encontrado." };
  if (membership.user_id === ctx.userId) return { ok: false, message: "Para trocar a sua senha, use a opção de esqueci a senha no login." };

  const { data: profile } = await supabase.from("user_profiles").select("email").eq("id", membership.user_id).maybeSingle();
  if (!profile?.email) return { ok: false, message: "Usuário sem e-mail cadastrado." };
  const mailError = await sendResetMail(profile.email);
  return mailError ? { ok: false, message: mailError } : { ok: true, message: `Enviamos o link de redefinição para ${profile.email}.` };
}

// Reenvia o e-mail de um convite pendente da própria empresa.
export async function resendInvite(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "E-mail não informado." };

  // só reenvia se o convite existe nesta empresa (o envio em si não olha a empresa)
  const { data: pending } = await supabase.rpc("tenant_search_users", {
    p_tenant_id: ctx.tenantId,
    p_q: email,
    p_status: "pending",
    p_limit: 5,
    p_offset: 0,
  });
  if (!(pending ?? []).some((p) => p.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, message: "Convite não encontrado nesta empresa." };
  }
  const mailError = await sendInviteMail(email);
  return mailError ? { ok: false, message: mailError } : { ok: true, message: `Convite enviado para ${email}.` };
}

export async function cancelInvite(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const supabase = await createClient();
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) return { ok: false, message: "Convite não informado." };
  const { error } = await supabase.rpc("tenant_cancel_invite", { p_invite_id: inviteId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/usuarios");
  return { ok: true, message: "Convite cancelado." };
}

const ROLE_KINDS = ["transportadora", "embarcador", "seguradora", "corretora", "gerenciadora_risco", "fornecedor", "outro"] as const;

export async function createOrganization(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  await requirePermission(ctx, "user.manage");
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const roleKind = String(formData.get("role_kind") ?? "outro");
  if (!name) throw new Error("Nome da organização é obrigatório.");
  const kind = (ROLE_KINDS as readonly string[]).includes(roleKind) ? roleKind : "outro";

  const { count: partners } = await supabase
    .from("tenant_organizations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", ctx.tenantId)
    .eq("is_owner", false);
  await assertCountLimit(supabase, ctx.tenantId, "organizations", "organizações participantes", partners ?? 0);

  const { error } = await supabase.rpc("create_partner_organization", { p_tenant_id: ctx.tenantId, p_name: name, p_role_kind: kind });
  if (error) throw new Error(error.message);

  revalidatePath("/usuarios");
}
