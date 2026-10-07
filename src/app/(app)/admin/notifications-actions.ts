"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { isTenantAdmin } from "@/lib/permissions";
import { publicDbMessage } from "@/lib/errors";
import { writeAudit } from "@/app/(app)/sinistros/actions";
import { RULE_KEYS, type RuleKey } from "@/lib/notifications";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EXTRA_EMAILS = 20;

// Uma regra por vez (uma linha da tela): liga/desliga, quem recebe e, no resumo diário, a hora. Só Administrador da empresa.
export async function saveNotificationRule(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const tenantId = String(formData.get("tenant_id") ?? "");
  const ruleKey = String(formData.get("rule_key") ?? "") as RuleKey;
  if (!tenantId || !RULE_KEYS.includes(ruleKey)) throw new Error("Aviso inválido.");
  const [platform, admin] = await Promise.all([isPlatformAdmin(), isTenantAdmin(user.id, tenantId)]);
  if (!platform && !admin) throw new Error("Só o Administrador da empresa configura as notificações.");

  const groupIds = [...new Set(formData.getAll("to_groups").map(String).filter(Boolean))];
  if (groupIds.length) {
    const { data: ok } = await supabase.from("groups").select("id").eq("tenant_id", tenantId).in("id", groupIds);
    if ((ok ?? []).length !== groupIds.length) throw new Error("Grupo inválido.");
  }

  const emails = [
    ...new Set(
      String(formData.get("extra_emails") ?? "")
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const bad = emails.find((e) => !EMAIL_RE.test(e) || e.length > 120);
  if (bad) throw new Error(`E-mail inválido: ${bad}`);
  if (emails.length > MAX_EXTRA_EMAILS) throw new Error(`Use no máximo ${MAX_EXTRA_EMAILS} e-mails fixos por aviso.`);

  const hour = Number(formData.get("digest_hour") ?? 8);
  const row = {
    tenant_id: tenantId,
    rule_key: ruleKey,
    enabled: formData.get("enabled") === "on",
    to_event_group: formData.get("to_event_group") === "on",
    to_requester: formData.get("to_requester") === "on",
    to_admins: formData.get("to_admins") === "on",
    to_groups: groupIds,
    extra_emails: emails,
    digest_hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("notification_rules").upsert(row, { onConflict: "tenant_id,rule_key" });
  if (error) throw new Error(publicDbMessage(error));

  await writeAudit(supabase, tenantId, "notification_rule.saved", "tenant", tenantId, { next: { rule_key: ruleKey, enabled: row.enabled, groups: groupIds.length, extra_emails: emails.length } });
  revalidatePath("/admin");
}
