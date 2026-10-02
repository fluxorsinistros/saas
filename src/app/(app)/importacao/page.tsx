import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { uploadImport } from "./actions";

export const metadata: Metadata = { title: "Importação em massa" };

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Enviado",
  validating: "Validando",
  preview: "Aguardando confirmação",
  error: "Erro",
  confirmed: "Confirmado",
  processing: "Processando",
  completed: "Concluído",
  failed: "Falhou",
};

export default async function ImportacaoPage() {
  const ctx = await getTenantContext();
  const supabase = await createClient();

  const { data: imports } = await supabase
    .from("imports")
    .select("id, file_name, status, total_rows, created_rows, error_rows, duplicate_rows, created_at")
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Importação em massa</h1>
        <p className="mt-1 max-w-xl text-[14px] text-slate-500">
          Um CSV com uma linha por sinistro cria os sinistros pelas mesmas regras da formalização manual — inclui a mesma
          validação de fluxo publicado, e o mesmo motor de execução assume a partir daí.
        </p>

        <form action={uploadImport} className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-5">
          <p className="mb-1 text-[13px] font-medium text-slate-700">Enviar planilha (.csv)</p>
          <p className="mb-3 text-[12px] text-slate-500">
            Colunas esperadas: <code className="rounded bg-slate-100 px-1 py-0.5">fluxo</code>,{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">data_ocorrencia</code> (opcional, AAAA-MM-DD),{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">local</code> (opcional),{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">referencia_externa</code> (opcional). &quot;fluxo&quot; precisa
            bater com o nome de um fluxo publicado.
          </p>
          <div className="flex items-center gap-3">
            <input name="file" type="file" accept=".csv,text/csv" required className="text-[13px]" />
            <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600">
              <Upload className="size-4" /> Enviar e validar
            </button>
          </div>
        </form>

        <section className="mt-8">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Importações anteriores</h2>
          {!imports?.length ? (
            <p className="text-[13px] text-slate-500">Nenhuma importação ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {imports.map((imp) => (
                <li key={imp.id}>
                  <Link href={`/importacao/${imp.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-slate-900">{imp.file_name}</div>
                      <div className="mt-0.5 text-[12px] text-slate-500">
                        {imp.total_rows ?? 0} linhas
                        {imp.status === "completed" && (
                          <>
                            {" "}
                            · {imp.created_rows ?? 0} criados · {imp.error_rows ?? 0} com erro · {imp.duplicate_rows ?? 0} duplicidade
                          </>
                        )}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {STATUS_LABEL[imp.status] ?? imp.status}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
