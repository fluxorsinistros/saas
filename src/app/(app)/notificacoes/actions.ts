"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { publicDbMessage } from "@/lib/errors";
import { RULE_KEYS, type RuleKey } from "@/lib/notifications";

// Cada pessoa liga ou desliga, só para si, os e-mails de cada aviso que a empresa ativou.
export async function setNotificationPreference(formData: FormData): Promise<void> {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const ruleKey = String(formData.get("rule_key") ?? "") as RuleKey;
  if (!RULE_KEYS.includes(ruleKey)) throw new Error("Aviso inválido.");
  const { error } = await supabase.from("notification_preferences").upsert(
    { tenant_id: ctx.tenantId, user_id: ctx.userId, rule_key: ruleKey, email_enabled: formData.get("email_enabled") === "on", updated_at: new Date().toISOString() },
    { onConflict: "tenant_id,user_id,rule_key" },
  );
  if (error) throw new Error(publicDbMessage(error));
  revalidatePath("/notificacoes");
}
