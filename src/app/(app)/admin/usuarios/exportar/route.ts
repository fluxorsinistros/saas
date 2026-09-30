import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platform-admin";

const UUID = /^[0-9a-f-]{36}$/i;
const STATUS_LABEL: Record<string, string> = { active: "Ativo", inactive: "Inativo", pending: "Convite pendente" };

// Campo entre aspas, para não quebrar em vírgula, ponto e vírgula ou quebra de linha; e sem "fórmulas" (=, +, -, @).
function cell(value: string | null | undefined): string {
  let v = (value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

// Exporta a lista de usuários com os mesmos filtros da tela (abre direto no Excel: UTF-8 com BOM, separador ;).
export async function GET(request: NextRequest) {
  if (!(await isPlatformAdmin())) return new NextResponse("Não autorizado", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const supabase = await createClient();

  const status = sp.get("status") ?? "";
  const { data: rows, error } = await supabase.rpc("admin_search_users", {
    p_q: sp.get("q")?.trim() || undefined,
    p_tenant_id: UUID.test(sp.get("tenant") ?? "") ? (sp.get("tenant") as string) : undefined,
    p_role_name: sp.get("role")?.trim() || undefined,
    p_status: ["active", "inactive", "pending"].includes(status) ? status : undefined,
    p_group_name: sp.get("group")?.trim() || undefined,
    p_limit: 10000,
    p_offset: 0,
  });
  if (error) return new NextResponse(error.message, { status: 500 });

  const header = ["Nome", "E-mail", "Empresa", "Tipo", "Grupos", "Situação"].map(cell).join(";");
  const lines = (rows ?? []).map((u) =>
    [u.full_name ?? "", u.email, u.tenant_name, u.role_name ?? "", u.groups ?? "", STATUS_LABEL[u.status] ?? u.status].map(cell).join(";"),
  );
  const body = "\uFEFF" + [header, ...lines].join("\r\n");
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="usuarios-${day}.csv"`,
    },
  });
}
