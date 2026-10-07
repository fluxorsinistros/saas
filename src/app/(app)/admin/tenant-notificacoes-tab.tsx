import { RULE_INFO, RULE_KEYS, type RuleKey } from "@/lib/notifications";
import { saveNotificationRule } from "./notifications-actions";

type Rule = {
  rule_key: string;
  enabled: boolean;
  to_event_group: boolean;
  to_requester: boolean;
  to_admins: boolean;
  to_groups: string[];
  extra_emails: string[];
  digest_hour: number;
};

const DEFAULTS: Record<RuleKey, Omit<Rule, "rule_key">> = {
  claim_opened: { enabled: false, to_event_group: true, to_requester: true, to_admins: false, to_groups: [], extra_emails: [], digest_hour: 8 },
  sla_at_risk: { enabled: false, to_event_group: true, to_requester: false, to_admins: false, to_groups: [], extra_emails: [], digest_hour: 8 },
  sla_breached: { enabled: false, to_event_group: true, to_requester: false, to_admins: true, to_groups: [], extra_emails: [], digest_hour: 8 },
  sla_digest: { enabled: false, to_event_group: false, to_requester: false, to_admins: true, to_groups: [], extra_emails: [], digest_hour: 8 },
  document_extra: { enabled: false, to_event_group: true, to_requester: true, to_admins: false, to_groups: [], extra_emails: [], digest_hour: 8 },
};

const check = "size-4 cursor-pointer accent-[var(--color-brand)]";

// Regras de e-mail da empresa: uma linha por aviso, cada uma salva sozinha. Aviso desligado nunca gera e-mail.
export function TenantNotificacoesTab({ tenantId, rules, groups }: { tenantId: string; rules: Rule[]; groups: { id: string; name: string }[] }) {
  const byKey = new Map(rules.map((r) => [r.rule_key, r]));
  return (
    <section className="max-w-3xl space-y-4">
      <p className="text-[13px] text-slate-700">
        Escolha quais avisos a empresa envia por e-mail e quem recebe cada um. Cada pessoa ainda pode desligar, só para si, os avisos que não
        quiser (em Minhas notificações). Os e-mails saem de no-reply@mail.elsem.com.br e a fila é processada a cada poucos minutos.
      </p>
      <ul className="space-y-3">
        {RULE_KEYS.map((key) => {
          const info = RULE_INFO[key];
          const r = { ...DEFAULTS[key], ...(byKey.get(key) ?? {}) };
          return (
            <li key={key} className="rounded-xl bg-white">
              <form action={saveNotificationRule} className="space-y-3 p-5">
                <input type="hidden" name="tenant_id" value={tenantId} />
                <input type="hidden" name="rule_key" value={key} />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[14px] font-semibold text-slate-900">{info.label}</h2>
                    <p className="text-[12px] text-slate-600">{info.hint}</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-[13px] font-medium text-slate-900">
                    <input type="checkbox" name="enabled" defaultChecked={r.enabled} className={check} />
                    Ligado
                  </label>
                </div>

                <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-slate-800">
                  <legend className="mb-1 text-[12px] font-medium text-slate-700">Quem recebe</legend>
                  {info.eventGroupLabel && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="to_event_group" defaultChecked={r.to_event_group} className={check} /> {info.eventGroupLabel}
                    </label>
                  )}
                  {info.requesterLabel && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="to_requester" defaultChecked={r.to_requester} className={check} /> {info.requesterLabel}
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="to_admins" defaultChecked={r.to_admins} className={check} /> Administradores
                  </label>
                </fieldset>

                {groups.length > 0 && (
                  <details className="text-[13px]">
                    <summary className="cursor-pointer text-[12px] font-medium text-brand">
                      Grupos fixos ({r.to_groups.length === 0 ? "nenhum" : r.to_groups.length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-slate-800">
                      {groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2">
                          <input type="checkbox" name="to_groups" value={g.id} defaultChecked={r.to_groups.includes(g.id)} className={check} /> {g.name}
                        </label>
                      ))}
                    </div>
                  </details>
                )}

                <label className="block text-[12px] font-medium text-slate-700">
                  E-mails fixos (separe por vírgula ou espaço)
                  <input
                    name="extra_emails"
                    defaultValue={r.extra_emails.join(", ")}
                    maxLength={1500}
                    placeholder="gestao@empresa.com.br"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900"
                  />
                </label>

                {key === "sla_digest" && (
                  <label className="flex items-center gap-2 text-[13px] text-slate-800">
                    Enviar a partir das
                    <select name="digest_hour" defaultValue={r.digest_hour} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-900">
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                    (horário de Brasília)
                  </label>
                )}

                <div className="flex justify-end">
                  <button className="cursor-pointer rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-brand-600">Salvar</button>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
