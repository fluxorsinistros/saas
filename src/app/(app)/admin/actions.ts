"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { sendInviteMail, sendResetMail } from "@/lib/auth-mail";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin, requirePlatformAdmin } from "@/lib/platform-admin";
import { isTenantAdmin } from "@/lib/permissions";
import { writeAudit } from "@/app/(app)/sinistros/actions";
import type { Json } from "@/lib/supabase/database.types";
import { PLAN_LIMITS } from "@/lib/plan-limits";

function money(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "0").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function createPlan(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const code = String(formData.get("code") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) throw new Error("Código e nome são obrigatórios.");

  const { data, error } = await supabase
    .from("plans")
    .insert({
      code,
      name,
      setup_fee: money(formData, "setup_fee"),
      monthly_fee: money(formData, "monthly_fee"),
      claim_price: money(formData, "claim_price"),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao criar plano.");

  await writeAudit(supabase, null, "plan.created", "plan", data.id, { next: { code, name } });
  revalidatePath("/admin", "layout");
}

// Edita nome e preços de um plano existente. O código (standard, professional…) não muda.
export async function updatePlan(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const planId = String(formData.get("plan_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!planId || !name) throw new Error("O nome do plano é obrigatório.");

  const next = {
    name,
    setup_fee: money(formData, "setup_fee"),
    monthly_fee: money(formData, "monthly_fee"),
    claim_price: money(formData, "claim_price"),
  };
  const { error } = await supabase.from("plans").update(next).eq("id", planId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "plan.updated", "plan", planId, { next });
  revalidatePath("/admin", "layout");
}

// Vazio = sem valor; "ilimitado" = null; número aceita vírgula. Lança erro em texto inválido.
function parseLimitField(raw: FormDataEntryValue | null, label: string): number | null | undefined {
  const text = String(raw ?? "").trim();
  if (text === "") return undefined;
  if (/^ilimitado$/i.test(text)) return null;
  const n = Number(text.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido em "${label}": use um número ou deixe vazio.`);
  return n;
}

// Grava todos os limites do catálogo de uma vez: campo vazio = sem limite (a linha é removida).
export async function savePlanLimits(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const planId = String(formData.get("plan_id") ?? "");
  if (!planId) throw new Error("Plano não informado.");

  const toSet: { plan_id: string; limit_key: string; limit_value: number | null }[] = [];
  const toClear: string[] = [];
  for (const def of PLAN_LIMITS) {
    const value = parseLimitField(formData.get(`limit_${def.key}`), def.label);
    if (value === undefined) toClear.push(def.key);
    else toSet.push({ plan_id: planId, limit_key: def.key, limit_value: value });
  }

  if (toSet.length) {
    const { error } = await supabase.from("plan_limits").upsert(toSet, { onConflict: "plan_id,limit_key" });
    if (error) throw new Error(error.message);
  }
  if (toClear.length) {
    const { error } = await supabase.from("plan_limits").delete().eq("plan_id", planId).in("limit_key", toClear);
    if (error) throw new Error(error.message);
  }

  await writeAudit(supabase, null, "plan_limit.set", "plan", planId, {
    next: Object.fromEntries(toSet.map((s) => [s.limit_key, s.limit_value])) as Json,
  });
  revalidatePath("/admin", "layout");
}

export async function removePlanLimit(limitId: string): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("plan_limits").delete().eq("id", limitId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

export async function assignContract(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const planId = String(formData.get("plan_id") ?? "");
  if (!tenantId || !planId) throw new Error("Escolha a empresa e o plano.");

  const { error } = await supabase
    .from("tenant_contracts")
    .upsert({ tenant_id: tenantId, plan_id: planId, status: "active" }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "contract.assigned", "tenant", tenantId, { next: { plan_id: planId } });
  revalidatePath("/admin", "layout");
}

export type ActionState = { ok: boolean; message: string } | null;

const INVITE_MESSAGE =
  "Convite registrado. Peça para a pessoa criar a conta com este e-mail (tela de login → Criar conta) e confirmar; no primeiro acesso ela entra na empresa com o tipo de acesso definido.";

// Cria a empresa cliente SEM incluir o administrador da plataforma como membro, e opcionalmente já dá
// acesso de administrador a um e-mail. Erros voltam como mensagem (Server Action lançando erro vira
// texto genérico em produção).
export async function createTenantAsAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const adminEmail = String(formData.get("admin_email") ?? "").trim();
  if (!name) return { ok: false, message: "Nome da empresa é obrigatório." };

  const { data: tenantId, error } = await supabase.rpc("admin_create_tenant", { p_name: name, p_admin_email: adminEmail || undefined });
  if (error || !tenantId) return { ok: false, message: error?.message ?? "Não foi possível criar a empresa." };

  revalidatePath("/admin", "layout");
  let message = `Empresa "${name}" criada.`;
  if (adminEmail) {
    const { data: ex } = await supabase.rpc("admin_list_tenant_users", { p_tenant_ids: [tenantId] });
    const pending = (ex ?? []).some((r) => r.pending);
    message += pending ? ` ${INVITE_MESSAGE}` : " Acesso de administrador concedido.";
  }
  return { ok: true, message };
}

// Adiciona um usuário à empresa com o tipo (papel) escolhido; sem conta ainda = convite (e, se marcado, e-mail).
const PW_MESSAGES: Record<string, string> = {
  created: "Usuário criado com a senha informada. Já pode entrar com o e-mail e essa senha.",
  password_reset: "Usuário adicionado e a senha definida. Já pode entrar com o e-mail e essa senha.",
  added_keep_password: "Usuário adicionado. Esta pessoa já tinha conta em outra empresa, então a senha dela não foi alterada.",
};

// Todo usuário pertence a uma organização da empresa; sem escolha, vale a própria empresa (padrão do banco).
async function applyOrganization(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, email: string, formData: FormData) {
  const orgId = String(formData.get("organization_id") ?? "");
  if (orgId) await supabase.rpc("set_person_organization", { p_tenant_id: tenantId, p_email: email, p_organization_id: orgId });
}

export async function addTenantUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const sendMail = formData.get("send_invite") === "on";
  if (!tenantId || !roleId || !email) return { ok: false, message: "Informe empresa, tipo e e-mail." };

  const password = String(formData.get("password") ?? "");
  if (password) {
    const { data: r, error: e } = await supabase.rpc("create_user_with_password", {
      p_tenant_id: tenantId,
      p_email: email,
      p_password: password,
      p_role_id: roleId,
      p_group_id: String(formData.get("group_id") ?? "") || null,
      p_full_name: String(formData.get("full_name") ?? "").trim() || null,
      p_phone: String(formData.get("phone") ?? "").trim() || null,
      p_cpf: String(formData.get("cpf") ?? "").trim() || null,
    });
    if (e) return { ok: false, message: e.message };
    await applyOrganization(supabase, tenantId, email, formData);
    revalidatePath("/admin", "layout");
    return { ok: true, message: PW_MESSAGES[r as string] ?? "Usuário adicionado." };
  }

  const { data, error } = await supabase.rpc("admin_add_person", {
    p_tenant_id: tenantId,
    p_email: email,
    p_role_id: roleId,
    p_group_id: String(formData.get("group_id") ?? "") || null,
    p_full_name: String(formData.get("full_name") ?? "").trim() || null,
    p_phone: String(formData.get("phone") ?? "").trim() || null,
    p_cpf: String(formData.get("cpf") ?? "").trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  await applyOrganization(supabase, tenantId, email, formData);
  revalidatePath("/admin", "layout");

  if (data === "added") return { ok: true, message: "Usuário adicionado. Ele já pode entrar na empresa." };
  if (!sendMail) return { ok: true, message: INVITE_MESSAGE };
  const mailError = await sendInviteMail(email);
  return mailError
    ? { ok: true, message: `Convite registrado, mas o e-mail não foi enviado: ${mailError} Use "Reenviar convite" depois.` }
    : {
        ok: true,
        message: `Convite registrado e e-mail enviado para ${email}. A pessoa digita o código de 6 dígitos recebido em /confirmar-convite para criar a senha.`,
      };
}

export async function sendInviteEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "E-mail não informado." };
  const mailError = await sendInviteMail(email);
  return mailError ? { ok: false, message: mailError } : { ok: true, message: `Convite enviado para ${email}.` };
}

export async function sendPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "E-mail não informado." };
  const mailError = await sendResetMail(email);
  return mailError ? { ok: false, message: mailError } : { ok: true, message: `Enviamos o link de redefinição para ${email}.` };
}

// Define diretamente a senha de um usuário. Exige a chave de serviço do Supabase (só no servidor).
export async function setUserPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const userId = String(formData.get("user_id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId) return { ok: false, message: "Usuário não informado." };
  if (password.length < 8) return { ok: false, message: "A senha precisa ter pelo menos 8 caracteres." };

  const { error } = await supabase.rpc("admin_set_user_password", { p_user_id: userId, p_password: password });
  if (error) return { ok: false, message: error.message };

  await writeAudit(supabase, null, "user.password_set_by_platform", "user", userId);
  return { ok: true, message: "Senha alterada. Combine com a pessoa como ela vai receber a nova senha." };
}

// Inativa (some o acesso na hora) ou reativa um usuário da empresa. Nada é apagado.
export async function setMemberActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const membershipId = String(formData.get("membership_id") ?? "");
  const active = formData.get("active") === "true";
  if (!membershipId) return { ok: false, message: "Usuário não informado." };
  // Volta como mensagem: a regra "a conta precisa manter um Administrador ativo" é checada pelo banco
  const { error } = await supabase.rpc("admin_set_member_active", { p_membership_id: membershipId, p_active: active });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true, message: active ? "Usuário reativado." : "Usuário inativado." };
}

// Cancela um convite pendente.
export async function revokeTenantAccess(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const inviteId = String(formData.get("invite_id") ?? "") || undefined;
  if (!inviteId) return;
  const { error } = await supabase.rpc("admin_revoke_tenant_access", { p_invite_id: inviteId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

export async function updateContractOverrides(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const contractId = String(formData.get("contract_id") ?? "");
  if (!contractId) throw new Error("Contrato não informado.");

  // Preserva overrides de chaves fora do catálogo (legado); as do catálogo vêm dos campos.
  const { data: current } = await supabase.from("tenant_contracts").select("overrides").eq("id", contractId).single();
  const known = new Set(PLAN_LIMITS.map((d) => d.key));
  const overrides: Record<string, Json> = {};
  for (const [k, v] of Object.entries((current?.overrides ?? {}) as Record<string, Json>)) {
    if (!known.has(k)) overrides[k] = v;
  }
  for (const def of PLAN_LIMITS) {
    const value = parseLimitField(formData.get(`limit_${def.key}`), def.label);
    if (value !== undefined) overrides[def.key] = value;
  }

  const { error } = await supabase.from("tenant_contracts").update({ overrides: overrides as Json }).eq("id", contractId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "contract.overrides_updated", "tenant_contract", contractId, { next: overrides as Json });
  revalidatePath("/admin", "layout");
}

// Suspende ou reativa a conta de um cliente. Suspensa: ninguém da empresa acessa nada (RLS), mas os
// dados ficam intactos. Só o administrador de plataforma chama isto (o banco também barra os demais).
export async function setTenantStatus(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!tenantId || (status !== "active" && status !== "suspended")) throw new Error("Pedido inválido.");

  const next =
    status === "suspended"
      ? { status, suspended_at: new Date().toISOString(), suspension_reason: reason || null }
      : { status, suspended_at: null, suspension_reason: null };
  const { error } = await supabase.from("tenants").update(next).eq("id", tenantId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, status === "suspended" ? "tenant.suspended" : "tenant.reactivated", "tenant", tenantId, {
    next: { status, reason: reason || null },
  });
  revalidatePath("/admin", "layout");
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
const LOGO_MAX_BYTES = 1024 * 1024;

// Nome, subtítulo e logo do produto (aparecem no menu, no login e no título da aba).
export async function savePlatformBranding(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const name = String(formData.get("product_name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  if (!name) throw new Error("O nome do produto é obrigatório.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: current } = await supabase.from("platform_settings").select("logo_path").eq("id", true).single();
  let logoPath = current?.logo_path ?? null;

  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) throw new Error("Logo precisa ser PNG, JPG, WEBP ou SVG.");
    if (file.size > LOGO_MAX_BYTES) throw new Error("Logo grande demais: máximo de 1 MB.");
    const path = `platform/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    if (logoPath) await supabase.storage.from("branding").remove([logoPath]);
    logoPath = path;
  } else if (formData.get("remove_logo") === "on" && logoPath) {
    await supabase.storage.from("branding").remove([logoPath]);
    logoPath = null;
  }

  const { error } = await supabase
    .from("platform_settings")
    .update({ product_name: name, tagline, logo_path: logoPath, updated_by: user?.id ?? null })
    .eq("id", true);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "platform.branding_updated", "platform", "settings", { next: { name, tagline, logo: !!logoPath } });
  revalidatePath("/", "layout");
}

// Libera (ou não) a marca própria do cliente, independente do plano, com acréscimo % sobre a mensalidade.
export async function setWhiteLabel(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const contractId = String(formData.get("contract_id") ?? "");
  const enabled = formData.get("enabled") === "on";
  const pct = money(formData, "surcharge_pct");
  if (!contractId) throw new Error("Contrato não informado.");
  if (pct < 0 || pct > 1000) throw new Error("O acréscimo deve ficar entre 0% e 1000%.");

  const next = { white_label_enabled: enabled, white_label_surcharge_pct: pct };
  const { error } = await supabase.from("tenant_contracts").update(next).eq("id", contractId);
  if (error) throw new Error(error.message);

  await writeAudit(supabase, null, "contract.white_label_updated", "tenant_contract", contractId, { next });
  revalidatePath("/admin", "layout");
}

// Renomeia a conta (empresa cliente).
export async function renameTenant(formData: FormData): Promise<void> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!tenantId || !name) throw new Error("O nome da conta é obrigatório.");
  const { error } = await supabase.from("tenants").update({ name }).eq("id", tenantId);
  if (error) throw new Error(error.message);
  await writeAudit(supabase, null, "tenant.renamed", "tenant", tenantId, { next: { name } });
  revalidatePath("/admin", "layout");
}

// Marca própria da conta (white-label): nome, subtítulo, cor e logo. Só vale se o white-label estiver liberado no contrato.
export async function saveTenantBranding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Não autenticado." };

  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) return { ok: false, message: "Conta não informada." };

  const [isPlatform, isCompanyAdmin] = await Promise.all([
    isPlatformAdmin(),
    isTenantAdmin(user.id, tenantId),
  ]);

  if (!isPlatform && !isCompanyAdmin) {
    return { ok: false, message: "Você não tem permissão para gerenciar a marca desta conta." };
  }

  const name = String(formData.get("brand_name") ?? "").trim();
  const tagline = String(formData.get("brand_tagline") ?? "").trim();
  const color = String(formData.get("brand_color") ?? "").trim();
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { ok: false, message: "A cor precisa estar no formato #RRGGBB." };

  const { data: contract } = await supabase.from("tenant_contracts").select("white_label_enabled").eq("tenant_id", tenantId).maybeSingle();
  if (!contract?.white_label_enabled) return { ok: false, message: "O white-label não está liberado para esta conta (módulo White-label necessário)." };

  const { data: tenant } = await supabase.from("tenants").select("settings").eq("id", tenantId).single();
  const settings = ((tenant?.settings ?? {}) as Record<string, Json>) ?? {};
  const previous = (settings.branding ?? {}) as { logo_path?: string | null };
  let logoPath = previous.logo_path ?? null;

  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type];
    if (!ext) return { ok: false, message: "Logo precisa ser PNG, JPG, WEBP ou SVG." };
    if (file.size > LOGO_MAX_BYTES) return { ok: false, message: "Logo grande demais: máximo de 1 MB." };
    const path = `tenants/${tenantId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { contentType: file.type });
    if (error) return { ok: false, message: error.message };
    if (logoPath) await supabase.storage.from("branding").remove([logoPath]);
    logoPath = path;
  } else if (formData.get("remove_logo") === "on" && logoPath) {
    await supabase.storage.from("branding").remove([logoPath]);
    logoPath = null;
  }

  const resetAll = formData.get("reset_branding") === "on";
  const isDefaultColor = !color || color.toLowerCase() === "#2563eb";
  const hasCustomization = !resetAll && Boolean(name || tagline || logoPath || !isDefaultColor);

  const next: Record<string, Json> = { ...settings };
  if (hasCustomization) {
    next.branding = {
      name: name || null,
      tagline: tagline || null,
      primary_color: color || null,
      logo_path: logoPath,
    };
  } else {
    delete next.branding;
    if (logoPath) {
      await supabase.storage.from("branding").remove([logoPath]);
      logoPath = null;
    }
  }

  const { error } = await supabase.from("tenants").update({ settings: next as Json }).eq("id", tenantId);
  if (error) return { ok: false, message: error.message };
  await writeAudit(supabase, null, "tenant.branding_updated", "tenant", tenantId, { next: { name: name || null, color: color || null, logo: !!logoPath } });
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  return { ok: true, message: hasCustomization ? "Configurações de marca salvas com sucesso!" : "Marca removida: a conta volta a usar a marca padrão da plataforma." };
}

// Salva os parâmetros gerais de SLA da empresa (calendário padrão e limiares de alerta)
export async function saveTenantSlaSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Não autenticado." };

  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) return { ok: false, message: "Conta não informada." };

  const [isPlatform, isCompanyAdmin] = await Promise.all([
    isPlatformAdmin(),
    isTenantAdmin(user.id, tenantId),
  ]);

  if (!isPlatform && !isCompanyAdmin) {
    return { ok: false, message: "Você não tem permissão para alterar as configurações de SLA desta conta." };
  }

  const defaultCalendarId = String(formData.get("default_calendar_id") ?? "").trim() || null;
  const warningPct = Number(formData.get("warning_threshold_pct") ?? 75);
  const criticalPct = Number(formData.get("critical_threshold_pct") ?? 90);

  const { data: tenant } = await supabase.from("tenants").select("settings").eq("id", tenantId).single();
  const settings = ((tenant?.settings ?? {}) as Record<string, Json>) ?? {};

  const next: Record<string, Json> = {
    ...settings,
    sla: {
      default_calendar_id: defaultCalendarId,
      warning_threshold_pct: isNaN(warningPct) ? 75 : Math.max(10, Math.min(99, warningPct)),
      critical_threshold_pct: isNaN(criticalPct) ? 90 : Math.max(10, Math.min(100, criticalPct)),
    } as Json,
  };

  const { error } = await supabase.from("tenants").update({ settings: next as Json }).eq("id", tenantId);
  if (error) return { ok: false, message: error.message };

  await writeAudit(supabase, null, "tenant.sla_updated", "tenant", tenantId, {
    next: { default_calendar_id: defaultCalendarId, warning_threshold_pct: warningPct, critical_threshold_pct: criticalPct },
  });

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  return { ok: true, message: "Configurações de SLA da empresa salvas com sucesso!" };
}

// Salva a pessoa inteira (dados, tipo, empresa, situação e grupo) de uma vez. Trocar a empresa move o usuário;
// trocar o tipo para Gestor o tira das empresas; tirar de Gestor exige escolher a empresa.
export async function saveUserEdit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "");
  if (!id) return { ok: false, message: "Usuário não informado." };
  if (!fullName) return { ok: false, message: "O nome é obrigatório." };
  if (!["gestor", "Administrador", "Operador"].includes(tipo)) return { ok: false, message: "Escolha o tipo." };

  const isGestor = tipo === "gestor";
  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!isGestor && !tenantId) return { ok: false, message: "Escolha a empresa." };

  const { data: newId, error } = await supabase.rpc("admin_save_person", {
    p_id: id,
    p_full_name: fullName,
    p_phone: String(formData.get("phone") ?? ""),
    p_cpf: String(formData.get("cpf") ?? ""),
    p_kind: isGestor ? "gestor" : "member",
    p_tenant_id: isGestor ? null : tenantId,
    p_role_name: isGestor ? "Operador" : tipo,
    p_active: isGestor ? true : formData.get("active") === "on",
    p_group_id: String(formData.get("group_id") ?? "") || null,
  });
  if (error || !newId) return { ok: false, message: error?.message ?? "Não foi possível salvar." };
  const orgId = String(formData.get("organization_id") ?? "");
  const email = String(formData.get("email") ?? "");
  if (!isGestor && orgId && email) {
    const { error: orgError } = await supabase.rpc("set_person_organization", { p_tenant_id: tenantId, p_email: email, p_organization_id: orgId });
    if (orgError) return { ok: false, message: orgError.message };
  }
  revalidatePath("/admin", "layout");
  // Mudou de empresa ou de nível: o endereço antigo pode nem existir mais, então o redirecionamento sai do servidor
  if (newId !== id) redirect(`/admin/usuarios/${newId}`);
  return { ok: true, message: "Usuário salvo." };
}

// Salva o ícone / logotipo exclusivo da empresa cliente (exibido na sidebar e nas identificações da conta).
export async function saveCompanyIcon(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Não autenticado." };

  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) return { ok: false, message: "Empresa não informada." };

  const [isPlatform, isCompanyAdmin] = await Promise.all([
    isPlatformAdmin(),
    isTenantAdmin(user.id, tenantId),
  ]);

  if (!isPlatform && !isCompanyAdmin) {
    return { ok: false, message: "Você não tem permissão para alterar as configurações desta empresa." };
  }

  const { data: tenant } = await supabase.from("tenants").select("settings").eq("id", tenantId).single();
  const settings = ((tenant?.settings ?? {}) as Record<string, Json>) ?? {};
  let iconPath = (settings.company_icon_path as string | null) ?? null;
  let iconUrl = (settings.company_icon_url as string | null) ?? null;

  const file = formData.get("company_icon");
  const removeIcon = formData.get("remove_icon") === "on";

  if (file instanceof File && file.size > 0) {
    const ext = LOGO_TYPES[file.type] || "webp";
    if (file.size > LOGO_MAX_BYTES) {
      return { ok: false, message: "Ícone grande demais: limite máximo de 1 MB." };
    }

    const path = `tenants/${tenantId}/company-icon-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("branding").upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

    if (!uploadError) {
      if (iconPath) {
        try {
          await supabase.storage.from("branding").remove([iconPath]);
        } catch {}
      }
      iconPath = path;
      iconUrl = null;
    } else {
      // Fallback robusto caso o Storage tenha política restritiva de RLS para o bucket 'branding':
      // Como o arquivo já foi pré-compactado em WebP no navegador (~20KB),
      // salvamos diretamente o Data URL otimizado no jsonb do tenant.
      const buffer = Buffer.from(await file.arrayBuffer());
      iconUrl = `data:${file.type};base64,${buffer.toString("base64")}`;
      iconPath = null;
    }
  } else if (removeIcon) {
    if (iconPath) {
      try {
        await supabase.storage.from("branding").remove([iconPath]);
      } catch {}
    }
    iconPath = null;
    iconUrl = null;
  }

  const next: Record<string, Json> = {
    ...settings,
    company_icon_path: iconPath,
    company_icon_url: iconUrl,
  };

  const { error: updateError } = await supabase.from("tenants").update({ settings: next as Json }).eq("id", tenantId);
  if (updateError) return { ok: false, message: updateError.message };

  try {
    await writeAudit(supabase, tenantId, "tenant.company_icon_updated", "tenant", tenantId, {
      next: { company_icon_path: iconPath, company_icon_url: !!iconUrl },
    });
  } catch (auditErr) {
    console.warn("Aviso ao registrar auditoria de ícone:", auditErr);
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/admin", "page");
  revalidatePath("/", "layout");

  const hasIcon = !!(iconPath || iconUrl);
  return {
    ok: true,
    message: hasIcon ? "Ícone da empresa salvo com sucesso!" : "Ícone removido com sucesso.",
  };
}

// Salva a preferência de tema da empresa (claro ou escuro) e atualiza o cookie de sessão
export async function saveTenantTheme(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Não autenticado." };

  const tenantId = String(formData.get("tenant_id") ?? "");
  const theme = String(formData.get("theme") ?? "light") as "light" | "dark";

  if (!["light", "dark"].includes(theme)) {
    return { ok: false, message: "Tema inválido selecionado." };
  }

  if (tenantId) {
    const [isPlatform, isCompanyAdmin] = await Promise.all([
      isPlatformAdmin(),
      isTenantAdmin(user.id, tenantId),
    ]);

    if (!isPlatform && !isCompanyAdmin) {
      return { ok: false, message: "Sem permissão para alterar as configurações desta conta." };
    }

    const { data: tenant } = await supabase.from("tenants").select("settings").eq("id", tenantId).single();
    const settings = ((tenant?.settings ?? {}) as Record<string, Json>) ?? {};
    const next: Record<string, Json> = {
      ...settings,
      theme,
    };

    const { error: updateError } = await supabase.from("tenants").update({ settings: next as Json }).eq("id", tenantId);
    if (updateError) return { ok: false, message: updateError.message };

    try {
      await writeAudit(supabase, tenantId, "tenant.theme_updated", "tenant", tenantId, { next: { theme } });
    } catch {}
  }

  const cookieStore = await cookies();
  cookieStore.set("app_theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");

  return {
    ok: true,
    message: `Tema ${theme === "dark" ? "Escuro" : "Claro"} definido com sucesso!`,
  };
}

// Ação rápida para alternar tema diretamente pela sidebar
export async function toggleQuickTheme(currentTheme: "light" | "dark", tenantId?: string): Promise<void> {
  const nextTheme: "light" | "dark" = currentTheme === "dark" ? "light" : "dark";
  const cookieStore = await cookies();
  cookieStore.set("app_theme", nextTheme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  if (tenantId) {
    try {
      const supabase = await createClient();
      const { data: tenant } = await supabase.from("tenants").select("settings").eq("id", tenantId).single();
      if (tenant) {
        const settings = ((tenant?.settings ?? {}) as Record<string, Json>) ?? {};
        await supabase.from("tenants").update({ settings: { ...settings, theme: nextTheme } as Json }).eq("id", tenantId);
      }
    } catch {}
  }

  revalidatePath("/", "layout");
}

