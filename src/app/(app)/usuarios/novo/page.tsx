import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { getRoleOptions } from "@/lib/tenant-roles";
import { NewUserForm } from "./new-user-form";

export const metadata: Metadata = { title: "Novo usuário" };

export default async function NewTenantUserPage() {
  const ctx = await getTenantContext();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);
  if (!perms.has("user.manage")) redirect("/usuarios");

  const supabase = await createClient();
  const [roles, { data: groups }] = await Promise.all([
    getRoleOptions(supabase, ctx.tenantId),
    supabase.from("groups").select("id, name").eq("tenant_id", ctx.tenantId).eq("status", "active").order("name"),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
        <div>
          <Link href="/usuarios" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Usuários
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">Novo usuário</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-500">
            Quem já tem conta entra na hora; quem ainda não tem recebe um convite para criar a senha. Você define o tipo e, para
            Operador, o grupo.
          </p>
        </div>
        <NewUserForm roles={roles} groups={(groups ?? []).map((g) => ({ id: g.id, name: g.name }))} />
      </div>
    </div>
  );
}
