import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { UserActions } from "../users-forms";
import { UserEditForm } from "./user-edit-form";

export const metadata: Metadata = { title: "Editar usuário" };

const UUID = /^[0-9a-f-]{36}$/i;

// O id é o da associação (Administrador/Operador) ou o do usuário (Gestor da plataforma).
export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: rows }, { data: tenants }, { data: roles }, { data: groups }, { data: auth }, { data: organizations }] = await Promise.all([
    supabase.rpc("admin_get_person", { p_id: id }),
    supabase.from("tenants").select("id, name").order("name"),
    supabase.from("roles").select("name").is("tenant_id", null).order("name"),
    supabase.rpc("admin_all_groups"),
    supabase.auth.getUser(),
    supabase.rpc("admin_all_organizations"),
  ]);
  const person = rows?.[0];
  if (!person) notFound();

  const isGestor = person.kind === "gestor";
  const { data: memberOrg } = person.membership_id
    ? await supabase.from("tenant_memberships").select("organization_id").eq("id", person.membership_id).maybeSingle()
    : { data: null };
  const tenantName = (tenants ?? []).find((t) => t.id === person.tenant_id)?.name;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
        <div>
          <Link href="/admin/usuarios" className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-3.5" /> Usuários
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">{person.full_name || person.email}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {isGestor ? "Gestor da plataforma" : `${tenantName ?? "—"} · ${person.role_name ?? "Sem tipo"} · ${person.status === "active" ? "Ativo" : "Inativo"}`}
          </p>
        </div>

        <UserEditForm
          id={id}
          fullName={person.full_name ?? ""}
          email={person.email}
          phone={person.phone ?? ""}
          cpf={person.cpf ?? ""}
          tenantId={person.tenant_id ?? ""}
          tipo={isGestor ? "gestor" : (person.role_name ?? "Operador")}
          active={person.status === "active"}
          groupId={person.group_id ?? ""}
          tenants={tenants ?? []}
          roles={(roles ?? []).map((r) => r.name)}
          groups={groups ?? []}
          organizations={organizations ?? []}
          organizationId={memberOrg?.organization_id ?? ""}
          isSelf={auth.user?.id === person.user_id}
        />

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Acesso</h2>
          <p className="mb-3 text-[12px] text-slate-500">
            O nome, o CPF e o telefone pertencem à pessoa e valem em todas as empresas dela. O e-mail é o login e não muda por aqui.
          </p>
          <UserActions
            hideStatus
            hideSetPassword={isGestor}
            row={{
              tenant_id: person.tenant_id,
              membership_id: person.membership_id,
              invite_id: null,
              user_id: person.user_id,
              email: person.email,
              pending: false,
              status: person.status,
            }}
          />
        </section>
      </div>
    </div>
  );
}
