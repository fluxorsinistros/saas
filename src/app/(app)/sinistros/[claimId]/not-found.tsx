import Link from "next/link";

// Aparece quando o sinistro não está disponível para a visão atual: outra empresa selecionada no menu, ou (para o Operador)
// um grupo ativo que nunca atuou nele. Em vez do 404 seco, diz o que conferir.
export default function ClaimNotFound() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow px-4 py-10 md:px-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Sinistro não disponível</h1>
        <p className="mt-2 max-w-xl text-[14px] text-slate-700">Não encontramos este sinistro na sua visão atual. Confira:</p>
        <ul className="mt-3 max-w-xl list-disc space-y-1 pl-5 text-[14px] text-slate-700">
          <li>se a empresa escolhida no topo do menu é a mesma do sinistro;</li>
          <li>se o grupo em que você atua agora (logo abaixo da empresa) é um dos que atuaram neste sinistro.</li>
        </ul>
        <Link href="/sinistros" className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-600">
          Voltar para Sinistros
        </Link>
      </div>
    </div>
  );
}
