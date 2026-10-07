import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { RULE_INFO, RULE_KEYS } from "@/lib/notifications";
import { PreferenceToggle } from "@/components/notifications/PreferenceToggle";

export const metadata: Metadata = { title: "Minhas notificações" };

export default async function MinhasNotificacoesPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const [{ data: rules }, { data: prefs }] = await Promise.all([
    supabase.from("notification_rules").select("rule_key").eq("tenant_id", ctx.tenantId).eq("enabled", true),
    supabase.from("notification_preferences").select("rule_key, email_enabled").eq("tenant_id", ctx.tenantId).eq("user_id", ctx.userId),
  ]);
  const active = new Set((rules ?? []).map((r) => r.rule_key));
  const off = new Set((prefs ?? []).filter((p) => !p.email_enabled).map((p) => p.rule_key));
  const keys = RULE_KEYS.filter((k) => active.has(k));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Minhas notificações</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-700">
            Escolha quais avisos por e-mail você quer receber. A mudança vale só para você. Quem decide quais avisos existem e para quem vão é o
            Administrador da empresa.
          </p>
        </div>
        {keys.length === 0 ? (
          <p className="rounded-xl bg-white px-5 py-6 text-[13px] text-slate-700">A empresa ainda não ativou nenhum aviso por e-mail.</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white">
            {keys.map((k) => (
              <PreferenceToggle key={k} ruleKey={k} label={RULE_INFO[k].label} hint={RULE_INFO[k].hint} enabled={!off.has(k)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
