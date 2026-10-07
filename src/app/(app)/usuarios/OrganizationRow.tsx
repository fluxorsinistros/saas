"use client";

import { useState } from "react";
import { Building2, Check, Pencil, X } from "lucide-react";
import { StateForm } from "@/components/StateForm";
import { updateOrganization } from "./actions";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export function OrganizationRow({
  organizationId,
  name,
  roleKind,
  isOwner,
  roleLabel,
  roleOptions,
  canManage,
}: {
  organizationId: string;
  name: string;
  roleKind: string;
  isOwner: boolean;
  roleLabel: string;
  roleOptions: { value: string; label: string }[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="px-5 py-3">
        <StateForm action={updateOrganization} successMessage="Organização atualizada.">
          <input type="hidden" name="organization_id" value={organizationId} />
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label htmlFor={`org-name-${organizationId}`} className="mb-1 block text-[12px] font-medium text-slate-600">
                Nome
              </label>
              <input id={`org-name-${organizationId}`} name="name" required defaultValue={name} className={input} autoFocus />
            </div>
            {!isOwner && (
              <div className="min-w-[180px]">
                <label htmlFor={`org-role-${organizationId}`} className="mb-1 block text-[12px] font-medium text-slate-600">
                  Papel
                </label>
                <select id={`org-role-${organizationId}`} name="role_kind" defaultValue={roleKind} className={input}>
                  {roleOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[14px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Check className="size-4" /> Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[14px] font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <X className="size-4" /> Fechar
            </button>
          </div>
        </StateForm>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
        <Building2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1 text-[14px] font-medium text-slate-900">{name}</div>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{roleLabel}</span>
      {canManage && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Editar ${name}`}
          className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil className="size-4" />
        </button>
      )}
    </li>
  );
}
