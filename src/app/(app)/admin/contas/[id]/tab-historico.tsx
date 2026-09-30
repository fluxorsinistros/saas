import { Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// Ações mais comuns em português; o que não estiver aqui aparece com o código original.
const ACTION_LABEL: Record<string, string> = {
  "tenant.created": "Conta criada",
  "tenant.renamed": "Conta renomeada",
  "tenant.suspended": "Conta suspensa",
  "tenant.reactivated": "Conta reativada",
  "tenant.branding_updated": "Marca da conta atualizada",
  "tenant.onboarding_completed": "Configuração inicial concluída",
  "contract.assigned": "Plano atribuído ou trocado",
  "contract.overrides_updated": "Limites da conta personalizados",
  "contract.white_label_updated": "White-label atualizado",
  "member.added": "Usuário adicionado",
  "member.added_by_platform": "Usuário adicionado pela plataforma",
  "member.invited_by_platform": "Convite registrado pela plataforma",
  "member.admin_granted": "Acesso de administrador concedido",
  "member.admin_invited": "Convite de administrador registrado",
  "member.invite_accepted": "Convite aceito",
  "member.invite_cancelled": "Convite cancelado",
  "member.access_revoked": "Acesso removido",
  "member.deactivated_by_platform": "Usuário inativado pela plataforma",
  "member.reactivated_by_platform": "Usuário reativado pela plataforma",
  "member.role_changed": "Tipo de acesso alterado",
  "member.access_changed": "Acesso de usuário alterado pelo Administrador",
  "member.updated_by_platform": "Usuário editado pela plataforma",
  "member.promoted_to_gestor": "Usuário promovido a Gestor da plataforma",
  "user.password_set_by_platform": "Senha definida pela plataforma",
  "claim.created": "Sinistro criado",
  "document.received": "Documento recebido",
  "document.requested": "Documento solicitado",
  "organization.created": "Organização criada",
};

function detail(newValue: unknown): string {
  if (!newValue || typeof newValue !== "object") return "";
  const v = newValue as Record<string, unknown>;
  const parts = [v.email, v.name, v.status, v.file_name].filter((x): x is string => typeof x === "string" && x.length > 0);
  return parts.join(" · ");
}

export async function TabHistorico({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();
  const { data: events } = await supabase.rpc("admin_tenant_audit", { p_tenant_id: tenantId, p_limit: 100 });

  if (!events?.length) {
    return <p className="rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-500">Nenhum registro para esta conta ainda.</p>;
  }
  return (
    <section>
      <p className="mb-3 text-[12px] text-slate-500">As 100 ações mais recentes desta conta, da mais nova para a mais antiga.</p>
      <ul className="space-y-1.5 border-l border-slate-200 pl-4">
        {events.map((e) => (
          <li key={e.id} className="relative text-[13px] text-slate-600">
            <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-slate-300" />
            <span className="font-medium text-slate-800">{ACTION_LABEL[e.action] ?? e.action}</span>
            {detail(e.new_value) && <span className="text-slate-500"> — {detail(e.new_value)}</span>}
            {e.reason && <span className="text-rose-700"> — {e.reason}</span>}
            <span className="ml-2 inline-flex items-center gap-1 text-[12px] text-slate-400">
              <Clock3 className="size-3" /> {new Date(e.created_at).toLocaleString("pt-BR")}
              {e.actor_email ? ` · ${e.actor_email}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
