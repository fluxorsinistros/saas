import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/tenant";
import { getPermissionCodes } from "@/lib/permissions";
import { confirmImport, ignoreImportRow, reviseImportRow } from "../actions";

export const metadata: Metadata = { title: "Importação" };

const ROW_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  valid: "Válida",
  error: "Erro",
  duplicate_candidate: "Possível duplicidade",
  ignored: "Ignorada",
  created: "Criada",
};

const ROW_STATUS_STYLE: Record<string, string> = {
  valid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  created: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200",
  duplicate_candidate: "bg-amber-50 text-amber-700 ring-amber-200",
  ignored: "bg-slate-100 text-slate-500 ring-slate-200",
  pending: "bg-slate-100 text-slate-500 ring-slate-200",
};

const input =
  "w-full rounded-md border border-slate-200 px-2 py-1 text-[12px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15";

export default async function ImportDetailPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const ctx = await getTenantContext();
  const supabase = await createClient();
  const perms = await getPermissionCodes(ctx.userId, ctx.tenantId);

  const { data: imp } = await supabase
    .from("imports")
    .select("id, file_name, status, total_rows, created_rows, error_rows, duplicate_rows, ignored_rows, created_at")
    .eq("id", importId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!imp) notFound();

  const { data: rows } = await supabase
    .from("import_rows")
    .select("id, row_number, raw_data, status, errors, created_claim_id, claims:created_claim_id(claim_number)")
    .eq("import_id", importId)
    .order("row_number", { ascending: true });

  const isDone = imp.status === "completed";
  const pendingCount = (rows ?? []).filter((r) => r.status === "valid" || r.status === "duplicate_candidate").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <Link href="/importacao" className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Importações
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] font-semibold tracking-tight text-slate-900">{imp.file_name}</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {imp.total_rows ?? 0} linhas
          </span>
        </div>

        {isDone && (
          <div className="mt-4 grid grid-cols-4 gap-3">
            <Stat label="Criados" value={imp.created_rows ?? 0} tone="emerald" />
            <Stat label="Erro" value={imp.error_rows ?? 0} tone="rose" />
            <Stat label="Duplicidade" value={imp.duplicate_rows ?? 0} tone="amber" />
            <Stat label="Ignorados" value={imp.ignored_rows ?? 0} tone="slate" />
          </div>
        )}

        {!isDone && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Prévia — nenhum sinistro foi criado ainda.</p>
              <p className="mt-0.5">
                Corrija as linhas com erro (ou deixe-as de fora) e confirme o lote. Só as linhas &quot;Válida&quot; — e
                &quot;Possível duplicidade&quot; se você marcar para incluir — viram sinistro.
              </p>
            </div>
          </div>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Prévia</h2>
          <ul className="space-y-2">
            {(rows ?? []).map((row) => {
              const raw = row.raw_data as { fluxo: string; data_ocorrencia: string; local: string; referencia_externa: string };
              const errors = (row.errors as string[] | null) ?? [];
              const claim = row.claims as unknown as { claim_number: string } | null;
              const editable = !isDone && (row.status === "error" || row.status === "duplicate_candidate");
              return (
                <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-slate-500">Linha {row.row_number}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                        ROW_STATUS_STYLE[row.status] ?? "bg-slate-100 text-slate-600 ring-slate-200"
                      }`}
                    >
                      {ROW_STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </div>

                  {row.status === "created" && claim ? (
                    <Link
                      href={`/sinistros/${row.created_claim_id}`}
                      className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
                    >
                      <CheckCircle2 className="size-3.5" /> {claim.claim_number} <ExternalLink className="size-3" />
                    </Link>
                  ) : (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-slate-600 sm:grid-cols-4">
                      <span>
                        <span className="text-slate-400">Fluxo:</span> {raw.fluxo || "—"}
                      </span>
                      <span>
                        <span className="text-slate-400">Data:</span> {raw.data_ocorrencia || "—"}
                      </span>
                      <span>
                        <span className="text-slate-400">Local:</span> {raw.local || "—"}
                      </span>
                      <span>
                        <span className="text-slate-400">Ref.:</span> {raw.referencia_externa || "—"}
                      </span>
                    </div>
                  )}

                  {errors.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {errors.map((e, i) => (
                        <li key={i} className="text-[12px] text-rose-700">
                          — {e}
                        </li>
                      ))}
                    </ul>
                  )}

                  {editable && (
                    <form action={reviseImportRow.bind(null, row.id)} className="mt-2.5 flex flex-wrap items-end gap-1.5 border-t border-slate-100 pt-2.5">
                      <input name="fluxo" defaultValue={raw.fluxo} placeholder="Fluxo" className={`${input} w-40`} />
                      <input name="data_ocorrencia" defaultValue={raw.data_ocorrencia} placeholder="AAAA-MM-DD" className={`${input} w-32`} />
                      <input name="local" defaultValue={raw.local} placeholder="Local" className={`${input} w-32`} />
                      <input name="referencia_externa" defaultValue={raw.referencia_externa} placeholder="Referência externa" className={`${input} w-40`} />
                      <button className="rounded-md border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50">
                        Corrigir e revalidar
                      </button>
                    </form>
                  )}

                  {!isDone && (row.status === "valid" || row.status === "error" || row.status === "duplicate_candidate") && (
                    <form action={ignoreImportRow.bind(null, row.id)} className="mt-1.5">
                      <button className="text-[11px] text-slate-400 hover:text-slate-600">Ignorar esta linha</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {!isDone && perms.has("import.confirm") && (
          <form action={confirmImport.bind(null, importId)} className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
              <input type="checkbox" name="include_duplicates" className="size-3.5 accent-[var(--color-brand)]" />
              Incluir &quot;possível duplicidade&quot; no lote mesmo assim
            </label>
            <button
              disabled={pendingCount === 0}
              className="ml-auto rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirmar e criar {pendingCount} sinistro{pendingCount === 1 ? "" : "s"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" | "amber" | "slate" }) {
  const style = {
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  }[tone];
  return (
    <div className={`rounded-xl px-3 py-2.5 ${style}`}>
      <div className="text-[20px] font-semibold">{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-[0.06em]">{label}</div>
    </div>
  );
}
