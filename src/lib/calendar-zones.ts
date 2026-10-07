// Fusos do Brasil que o calendário de SLA aceita (o expediente vale no relógio do fuso escolhido).
export const CALENDAR_TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (SP, RJ, MG, sul e a maior parte do país)" },
  { value: "America/Manaus", label: "Manaus (AM, RO, RR)" },
  { value: "America/Cuiaba", label: "Cuiabá e Campo Grande (MT, MS)" },
  { value: "America/Fortaleza", label: "Fortaleza (CE, nordeste sem horário de verão)" },
  { value: "America/Rio_Branco", label: "Rio Branco (AC)" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
] as const;
