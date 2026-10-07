import Link from "next/link";
import { signOut } from "@/app/login/actions";

// Operador que já tem acesso à empresa mas ainda não foi colocado em nenhum grupo: as telas dependem do grupo (o que ele vê e faz),
// então em vez de abrir telas vazias ou quebradas mostramos o que falta e quem resolve.
export function SemGrupo({ tenantName, email }: { tenantName: string; email: string }) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <section className="glass-card w-full max-w-md p-6" aria-labelledby="sem-grupo-titulo">
        <h1 id="sem-grupo-titulo" className="text-[20px] font-semibold tracking-tight text-slate-900">
          Falta um passo para liberar o seu acesso
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-700">
          Você já tem acesso a <strong className="font-semibold text-slate-900">{tenantName}</strong>, mas ainda não foi colocado em nenhum grupo. O grupo define o que
          você vê e o que pode fazer.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-700">
          Peça ao Administrador da empresa para incluir <span className="font-medium text-slate-900">{email}</span> em um grupo, em Usuários. Quando ele terminar, atualize esta
          página.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard" className="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-600">
            Atualizar
          </Link>
          <form action={signOut}>
            <button className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50">Sair</button>
          </form>
        </div>
      </section>
    </main>
  );
}
