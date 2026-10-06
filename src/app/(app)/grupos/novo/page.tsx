import { GroupAppearancePicker } from "@/components/GroupAppearancePicker";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { createGroup } from "../actions";

export const metadata: Metadata = { title: "Novo grupo" };

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export default async function NewGroupPage() {
  const ctx = await getTenantContext();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  if (!perms.has("user.manage")) redirect("/grupos");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div>
          <Link href="/grupos" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Grupos
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">Novo grupo</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-700">
            Grupos são as unidades operacionais que respondem pelas etapas do fluxo — qualquer membro ativo do grupo pode atuar
            nas etapas apontadas para ele.
          </p>
        </div>

        <form action={createGroup} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <label htmlFor="name" className="mb-1 block text-[12px] font-medium text-slate-600">
              Nome
            </label>
            <input id="name" name="name" required placeholder="Ex.: Sinistros Sul" className={input} />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-[12px] font-medium text-slate-600">
              Descrição <span className="font-normal text-slate-500">(opcional)</span>
            </label>
            <input id="description" name="description" className={input} />
          </div>
          <GroupAppearancePicker />
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
            Criar grupo
          </button>
        </form>
      </div>
    </div>
  );
}
