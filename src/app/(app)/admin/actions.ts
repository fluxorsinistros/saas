"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendInviteMail, sendResetMail } from "@/lib/auth-mail";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
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
export async function addTenantUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const roleId = String(formData.get("role_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const sendMail = formData.get("send_invite") === "on";
  if (!tenantId || !roleId || !email) return { ok: false, message: "Informe empresa, tipo e e-mail." };

  const { data, error } = await supabase.rpc("admin_add_tenant_user", { p_tenant_id: tenantId, p_email: email, p_role_id: roleId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin", "layout");

  if (data === "added") return { ok: true, message: "Usuário adicionado. Ele já pode entrar na empresa." };
  if (!sendMail) return { ok: true, message: INVITE_MESSAGE };
  const mailError = await sendInviteMail(email);
  return mailError
    ? { ok: true, message: `Convite registrado, mas o e-mail não foi enviado: ${mailError} Use "Reenviar convite" depois.` }
    : { ok: true, message: `Convite registrado e e-mail enviado para ${email}. A pessoa define a senha pelo link.` };
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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return {
      ok: false,
      message: "Para definir senha diretamente é preciso configurar SUPABASE_SERVICE_ROLE_KEY no servidor (.env.local e Vercel). Enquanto isso, use \"Enviar redefinição\".",
    };
  }
  const { data: allowed } = await supabase.rpc("admin_can_manage_user", { p_user_id: userId });
  if (!allowed) return { ok: false, message: "Esta tela não altera a senha de outro Gestor da plataforma." };

  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
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
  await requirePlatformAdmin();
  const supabase = await createClient();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const name = String(formData.get("brand_name") ?? "").trim();
  const tagline = String(formData.get("brand_tagline") ?? "").trim();
  const color = String(formData.get("brand_color") ?? "").trim();
  if (!tenantId) return { ok: false, message: "Conta não informada." };
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { ok: false, message: "A cor precisa estar no formato #RRGGBB." };

  const { data: contract } = await supabase.from("tenant_contracts").select("white_label_enabled").eq("tenant_id", tenantId).maybeSingle();
  if (!contract?.white_label_enabled) return { ok: false, message: "O white-label não está liberado para esta conta (aba Plano e cobrança)." };

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

  // Sem nome = a conta volta a usar a marca da plataforma
  const next: Record<string, Json> = { ...settings };
  if (name) next.branding = { name, tagline, primary_color: color || null, logo_path: logoPath };
  else delete next.branding;

  const { error } = await supabase.from("tenants").update({ settings: next as Json }).eq("id", tenantId);
  if (error) return { ok: false, message: error.message };
  await writeAudit(supabase, null, "tenant.branding_updated", "tenant", tenantId, { next: { name: name || null, color: color || null, logo: !!logoPath } });
  revalidatePath("/admin", "layout");
  return { ok: true, message: name ? "Marca da conta salva." : "Marca removida: a conta usa a marca da plataforma." };
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
  revalidatePath("/admin", "layout");
  // Mudou de empresa ou de nível: o endereço antigo pode nem existir mais, então o redirecionamento sai do servidor
  if (newId !== id) redirect(`/admin/usuarios/${newId}`);
  return { ok: true, message: "Usuário salvo." };
}
