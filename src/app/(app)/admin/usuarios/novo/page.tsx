import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { AddUserForm } from "../users-forms";

export const metadata: Metadata = { title: "Novo usuário" };

export default async function NewUserPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: tenants }, { data: roles }] = await Promise.all([
    supabase.from("tenants").select("id, name").order("name"),
    supabase.from("roles").select("id, name").is("tenant_id", null).order("name"),
  ]);
  const serviceKeyMissing = !process.env.SUPABASE_SERVICE_ROLE_KEY;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
        <div>
          <Link href="/admin/usuarios" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Usuários
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">Novo usuário</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-500">
            Escolha a empresa e o tipo de acesso. Quem já tem conta entra na hora; quem ainda não tem recebe um convite para criar a senha.
            Depois de adicionar, abra o usuário na lista para vinculá-lo a grupos.
          </p>
        </div>
        {serviceKeyMissing && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
            &quot;Definir senha&quot; direto ainda não está ativo: falta configurar <code>SUPABASE_SERVICE_ROLE_KEY</code> no servidor.
            Convite e redefinição por e-mail funcionam normalmente.
          </p>
        )}
        <AddUserForm tenants={tenants ?? []} roles={roles ?? []} />
      </div>
    </div>
  );
}
