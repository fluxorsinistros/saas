// Notificações por e-mail: catálogo dos avisos (usado nas telas) e montagem do e-mail (usada pela rota de envio).

export const RULE_KEYS = ["claim_opened", "stage_assigned", "sla_at_risk", "sla_breached", "sla_digest", "document_extra"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

export const RULE_INFO: Record<RuleKey, { label: string; hint: string; eventGroupLabel: string | null; requesterLabel: string }> = {
  claim_opened: { label: "Sinistro aberto", hint: "Ao formalizar um sinistro", eventGroupLabel: "Grupo da 1ª etapa", requesterLabel: "Quem formalizou" },
  stage_assigned: { label: "Etapa atribuída ao grupo", hint: "Quando o sinistro chega a uma nova etapa (depois da primeira)", eventGroupLabel: "Grupo da etapa", requesterLabel: "Quem formalizou" },
  sla_at_risk: { label: "SLA em risco", hint: "Quando chega ao limite de alerta do SLA", eventGroupLabel: "Grupo da etapa", requesterLabel: "Quem formalizou" },
  sla_breached: { label: "SLA estourado", hint: "Quando o prazo vence", eventGroupLabel: "Grupo da etapa", requesterLabel: "Quem formalizou" },
  sla_digest: { label: "Resumo diário", hint: "Um e-mail por dia com o que está atrasado ou perto do prazo", eventGroupLabel: null, requesterLabel: "" },
  document_extra: { label: "Documento extra", hint: "Pedido, entrega, OK e rejeição", eventGroupLabel: "Grupo responsável", requesterLabel: "Quem pediu" },
};

export const NOTIFICATION_FROM = "Fluxor <no-reply@mail.elsem.com.br>";

export type DeliveryItem = {
  id: string;
  email: string;
  rule_key: string;
  event_type: string;
  payload: Record<string, unknown>;
  tenant_name: string;
  group_name: string | null;
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function fmtDate(iso: unknown): string {
  const d = new Date(String(iso ?? ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
}

function fmtLate(iso: unknown): string {
  const ms = Date.now() - new Date(String(iso ?? "")).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  const text = d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${min % 60}min` : `${min}min`;
  return ms >= 0 ? `Atrasado há ${text}` : `Faltam ${text}`;
}

type Built = { subject: string; headline: string; badge?: { text: string; tone: "danger" | "warn" | "info" | "ok" }; rows: [string, string][]; cta: { label: string; href: string }; digest?: { number: string; href: string; late: boolean; target: string }[] };

export function buildEmail(item: DeliveryItem, appUrl: string): { subject: string; html: string; text: string } {
  const p = item.payload;
  const claimNumber = String(p.claim_number ?? "");
  const claimHref = p.claim_id ? `${appUrl}/sinistros/${p.claim_id}` : appUrl;
  const group = item.group_name ?? "";
  let b: Built;

  switch (item.event_type) {
    case "claim.opened":
      b = {
        subject: `Novo sinistro ${claimNumber}`,
        headline: `Sinistro ${claimNumber} aberto`,
        badge: { text: "Novo", tone: "info" },
        rows: [
          ["Fluxo", String(p.workflow_name ?? "")],
          ["Primeira etapa", String(p.stage_name ?? "")],
          ["Grupo", group],
        ],
        cta: { label: "Abrir sinistro", href: claimHref },
      };
      break;
    case "stage.assigned":
      b = {
        subject: `Nova etapa no sinistro ${claimNumber}`,
        headline: `O sinistro ${claimNumber} chegou à etapa "${String(p.stage_name ?? "")}"`,
        badge: { text: p.target_at ? `Prazo ${fmtDate(p.target_at)}` : p.entry_reason === "reopen" ? "Reaberto" : "Sua vez", tone: "info" },
        rows: [
          ["Etapa", String(p.stage_name ?? "")],
          ["Grupo", group],
          ["Fluxo", String(p.workflow_name ?? "")],
        ],
        cta: { label: "Abrir sinistro", href: claimHref },
      };
      break;
    case "sla.at_risk":
      b = {
        subject: `Prazo em risco no sinistro ${claimNumber}`,
        headline: `Prazo em risco no sinistro ${claimNumber}`,
        badge: { text: fmtLate(p.target_at), tone: "warn" },
        rows: [
          ["Etapa", String(p.stage_name ?? "")],
          ["Grupo", group],
          ["Prazo", fmtDate(p.target_at)],
        ],
        cta: { label: "Abrir sinistro", href: claimHref },
      };
      break;
    case "sla.breached":
      b = {
        subject: `Prazo estourado no sinistro ${claimNumber}`,
        headline: `Prazo estourado no sinistro ${claimNumber}`,
        badge: { text: fmtLate(p.target_at), tone: "danger" },
        rows: [
          ["Etapa", String(p.stage_name ?? "")],
          ["Grupo", group],
          ["Prazo era", fmtDate(p.target_at)],
        ],
        cta: { label: "Abrir sinistro", href: claimHref },
      };
      break;
    case "sla.digest": {
      const items = (Array.isArray(p.items) ? p.items : []) as { claim_id: string; claim_number: string; target_at: string; overdue: boolean }[];
      const late = items.filter((i) => i.overdue).length;
      b = {
        subject: `Resumo de prazos: ${late} atrasado(s), ${items.length - late} perto do prazo`,
        headline: "Resumo diário de prazos",
        badge: { text: `${late} atrasado(s)`, tone: late > 0 ? "danger" : "ok" },
        rows: [],
        cta: { label: "Abrir Torre de Controle", href: `${appUrl}/torre-de-controle` },
        digest: items.slice(0, 30).map((i) => ({ number: i.claim_number, href: `${appUrl}/sinistros/${i.claim_id}`, late: i.overdue, target: fmtDate(i.target_at) })),
      };
      break;
    }
    case "document_extra.requested":
      b = {
        subject: `Documento solicitado no sinistro ${claimNumber}`,
        headline: `Envie o documento "${String(p.document_name ?? "")}"`,
        badge: { text: p.due_at ? `Prazo ${fmtDate(p.due_at)}` : "Solicitado", tone: "info" },
        rows: [["Sinistro", claimNumber], ["Grupo", group]],
        cta: { label: "Enviar documento", href: claimHref },
      };
      break;
    case "document_extra.delivered":
      b = {
        subject: `Documento enviado no sinistro ${claimNumber}`,
        headline: `Documento "${String(p.document_name ?? "")}" enviado`,
        badge: { text: "Aguardando seu OK", tone: "info" },
        rows: [["Sinistro", claimNumber], ["Arquivo", String(p.file_name ?? "")]],
        cta: { label: "Conferir documento", href: claimHref },
      };
      break;
    case "document_extra.validated":
      b = {
        subject: `Documento aprovado no sinistro ${claimNumber}`,
        headline: `Documento "${String(p.document_name ?? "")}" aprovado`,
        badge: { text: "Aprovado", tone: "ok" },
        rows: [["Sinistro", claimNumber]],
        cta: { label: "Abrir sinistro", href: claimHref },
      };
      break;
    case "document_extra.rejected":
      b = {
        subject: `Documento rejeitado no sinistro ${claimNumber}`,
        headline: `Documento "${String(p.document_name ?? "")}" rejeitado`,
        badge: { text: "Envie de novo", tone: "danger" },
        rows: [["Sinistro", claimNumber], ["Motivo", String(p.reason ?? "")]],
        cta: { label: "Enviar de novo", href: claimHref },
      };
      break;
    default:
      b = { subject: "Aviso do Fluxor", headline: "Aviso do Fluxor", rows: [], cta: { label: "Abrir o Fluxor", href: appUrl } };
  }

  const tones = {
    danger: ["#fde8e8", "#9b1c1c"],
    warn: ["#fdf3d8", "#8a5a00"],
    info: ["#e3ecfd", "#1d3fa8"],
    ok: ["#dcf5e7", "#146c43"],
  } as const;
  const badge = b.badge && b.badge.text ? `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:13px;background:${tones[b.badge.tone][0]};color:${tones[b.badge.tone][1]}">${esc(b.badge.text)}</span>` : "";
  const rows = b.rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 0;color:#5b6472;font-size:14px">${esc(k)}</td><td style="padding:4px 0;text-align:right;font-size:14px;color:#111827">${esc(v)}</td></tr>`)
    .join("");
  const digest = b.digest
    ? `<table role="presentation" width="100%" style="margin-top:12px;border-collapse:collapse">${b.digest
        .map((d) => `<tr><td style="padding:6px 0;border-top:1px solid #eef0f4;font-size:14px"><a href="${esc(d.href)}" style="color:#1d3fa8;text-decoration:none">${esc(d.number)}</a></td><td style="padding:6px 0;border-top:1px solid #eef0f4;text-align:right;font-size:13px;color:${d.late ? "#9b1c1c" : "#8a5a00"}">${d.late ? "Atrasado" : "Perto do prazo"} · ${esc(d.target)}</td></tr>`)
        .join("")}</table>`
    : "";
  const prefs = `${appUrl}/notificacoes`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#eef2f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="480" style="max-width:480px;background:#ffffff;border-radius:12px;padding:24px">
<tr><td>
<div style="font-size:13px;color:#5b6472">${esc(item.tenant_name)}</div>
<div style="font-size:19px;font-weight:bold;color:#111827;margin:6px 0 10px">${esc(b.headline)}</div>
<div>${badge}</div>
<table role="presentation" width="100%" style="margin-top:14px;border-collapse:collapse">${rows}</table>
${digest}
<a href="${esc(b.cta.href)}" style="display:inline-block;margin-top:18px;background:#3652d0;color:#ffffff;text-decoration:none;font-size:15px;padding:10px 18px;border-radius:8px">${esc(b.cta.label)}</a>
<div style="margin-top:24px;font-size:12px;color:#7b8494;line-height:1.5">Você recebe este aviso porque a empresa ${esc(item.tenant_name)} ativou esta notificação para você. <a href="${esc(prefs)}" style="color:#7b8494">Parar de receber este aviso</a></div>
</td></tr></table></td></tr></table></body></html>`;
  const text = [b.headline, ...b.rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), "", `${b.cta.label}: ${b.cta.href}`, "", `Parar de receber este aviso: ${prefs}`].join("\n");
  return { subject: b.subject, html, text };
}
