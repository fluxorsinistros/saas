// Mensagens de erro do banco que vão para a tela. Erros de regra de negócio (RAISE EXCEPTION, SQLSTATE P0001)
// e de autenticação já são escritos para o usuário e passam como estão; o resto (nome de tabela, constraint,
// detalhe de SQL) vira texto genérico, nunca expõe a estrutura interna.
type DbError = { message: string; code?: string | null };

const GENERIC: Record<string, string> = {
  "23505": "Já existe um registro com esses dados.",
  "23503": "Este registro está ligado a outros dados e não pode ser alterado ou removido.",
  "23502": "Faltam dados obrigatórios.",
  "23514": "Algum valor informado não é permitido.",
  "42501": "Você não tem permissão para esta ação.",
};

export function publicDbMessage(error: DbError): string {
  const code = error.code ?? "";
  if (code === "P0001") return error.message;
  if (GENERIC[code]) return GENERIC[code];
  const isSqlState = /^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST");
  return isSqlState ? "Não foi possível concluir a ação. Tente novamente." : error.message;
}
