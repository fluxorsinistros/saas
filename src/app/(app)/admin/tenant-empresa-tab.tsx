import Link from "next/link";
import { Building2, Shield, UsersRound, Calendar, ArrowRight, CheckCircle2 } from "lucide-react";

type Props = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    operating_model: string | null;
    created_at: string;
    status: string;
  };
  contract: {
    plan_name?: string;
    white_label_enabled: boolean;
    status: string;
    started_at: string;
  } | null;
  membersCount: number;
};

export function TenantEmpresaTab({ tenant, contract, membersCount }: Props) {
  const formattedCreated = new Date(tenant.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Card Empresa */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-brand">
              <Building2 className="size-5" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">{tenant.name}</h3>
              <p className="text-[12px] text-slate-500">Identificador: @{tenant.slug}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-[12px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Situação da Conta:</span>
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                Ativa
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Membro desde:</span>
              <span className="font-medium text-slate-700">{formattedCreated}</span>
            </div>
            {tenant.operating_model && (
              <div className="flex justify-between">
                <span className="text-slate-500">Modelo Operacional:</span>
                <span className="font-medium capitalize text-slate-700">{tenant.operating_model}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card Plano e Contrato */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Shield className="size-5" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">
                Plano: {contract?.plan_name ?? "Padrão"}
              </h3>
              <p className="text-[12px] text-slate-500">
                Status: {contract?.status === "active" ? "Contrato Ativo" : "Em análise"}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-[12px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Módulo White-label:</span>
              <span
                className={`font-semibold ${
                  contract?.white_label_enabled ? "text-emerald-600" : "text-slate-400"
                }`}
              >
                {contract?.white_label_enabled ? "Liberado" : "Não contratado"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Vigência:</span>
              <span className="font-medium text-slate-700">Contínuo</span>
            </div>
          </div>
        </div>

        {/* Card Equipe e Membros */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <UsersRound className="size-5" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-slate-900">Usuários da Empresa</h3>
              <p className="text-[12px] text-slate-500">{membersCount} membro(s) cadastrado(s)</p>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <Link
              href="/usuarios"
              className="flex items-center justify-between text-[12px] font-medium text-brand hover:text-brand-600"
            >
              <span>Gerenciar Membros e Acessos</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
