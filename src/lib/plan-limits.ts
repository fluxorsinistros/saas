// Catálogo de limites de plano. `key` é o que fica gravado em plan_limits.limit_key e em
// tenant_contracts.overrides — o administrador nunca digita a chave, escolhe pelo rótulo.
//
// kind "number": vazio = sem limite. kind "toggle": 1 = permitido, 0 = bloqueado (sem valor = bloqueado).
export type PlanLimitDef = {
  key: string;
  label: string;
  unit: string;
  hint: string;
  kind: "number" | "toggle";
};

export const PLAN_LIMITS: readonly PlanLimitDef[] = [
  { key: "users", label: "Usuários", unit: "usuários", hint: "Máximo de usuários ativos da empresa", kind: "number" },
  { key: "groups", label: "Grupos", unit: "grupos", hint: "Máximo de grupos de usuários", kind: "number" },
  { key: "organizations", label: "Organizações participantes", unit: "organizações", hint: "Transportadoras, seguradoras, gerenciadoras etc.", kind: "number" },
  { key: "workflows", label: "Workflows", unit: "workflows", hint: "Máximo de workflows configurados", kind: "number" },
  { key: "claim_types", label: "Tipos de sinistro", unit: "tipos", hint: "Máximo de tipos de sinistro", kind: "number" },
  { key: "file_max_mb", label: "Tamanho máximo por arquivo", unit: "MB", hint: "Tamanho padrão permitido por arquivo", kind: "number" },
  { key: "allow_file_overage", label: "Aceitar arquivo maior que o máximo", unit: "sim/não", hint: "Se permitido, arquivos acima do máximo entram com cobrança extra; se bloqueado, são recusados", kind: "toggle" },
  { key: "storage_per_claim_mb", label: "Armazenamento por sinistro", unit: "MB", hint: "Franquia de arquivos de cada sinistro", kind: "number" },
  { key: "allow_storage_overage", label: "Aceitar armazenamento acima da franquia", unit: "sim/não", hint: "Se permitido, o que passar da franquia do sinistro é cobrado; se bloqueado, o upload é recusado", kind: "toggle" },
  { key: "storage_overage_price_per_mb", label: "Preço do excedente de armazenamento", unit: "R$ por MB", hint: "Cobrado por MB acima do permitido", kind: "number" },
];

export const PLAN_LIMIT_KEYS = new Set(PLAN_LIMITS.map((l) => l.key));
