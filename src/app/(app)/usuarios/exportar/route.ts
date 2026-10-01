import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";

const STATUS_LABEL: Record<string, string> = { active: "Ativo", inactive: "Inativo", pending: "Convite pendente" };

// Campo entre aspas, para não quebrar em vírgula, ponto e vírgula ou quebra de linha; e sem "fórmulas" (=, +, -, @).
function cell(value: string | null | undefined): string {
  let v = (value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

// Exporta a lista de usuários da PRÓPRIA empresa com os mesmos filtros da tela (abre direto no Excel).
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext();
  const sp = request.nextUrl.searchParams;
  const supabase = await createClient();

  const status = sp.get("status") ?? "";
  const { data: rows, error } = await supabase.rpc("tenant_search_users", {
    p_tenant_id: ctx.tenantId,
    p_q: sp.get("q")?.trim() || undefined,
    p_role_name: sp.get("role")?.trim() || undefined,
    p_status: ["active", "inactive", "pending"].includes(status) ? status : undefined,
    p_group_name: sp.get("group")?.trim() || undefined,
    p_organization_name: sp.get("org")?.trim() || undefined,
    p_limit: 10000,
    p_offset: 0,
  });
  if (error) return new NextResponse(error.message, { status: 500 });

  const header = ["Nome", "E-mail", "Tipo", "Organização", "Grupo", "Situação"].map(cell).join(";");
  const lines = (rows ?? []).map((u) =>
    [u.full_name ?? "", u.email, u.role_name ?? "", u.organization_name ?? "", u.groups ?? "", STATUS_LABEL[u.status] ?? u.status].map(cell).join(";"),
  );
  const body = "﻿" + [header, ...lines].join("\r\n");
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="usuarios-${day}.csv"`,
    },
  });
}
