import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlatformBrandMark } from "@/components/PlatformBrandMark";
import { signOut } from "@/app/login/actions";
import { getPlatformBrand } from "@/lib/branding";

export const metadata: Metadata = { title: "Conta suspensa" };

export default async function SuspendedAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const brand = await getPlatformBrand();
  const { data: blocked } = await supabase.rpc("my_blocked_tenants");
  if (!blocked?.length) redirect("/dashboard");

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <PlatformBrandMark tone="light" />
        <h1 className="mt-10 text-[22px] font-semibold tracking-tight text-slate-900">Conta suspensa</h1>
        <p className="mt-1 text-[14px] text-slate-500">
          O acesso {blocked.length > 1 ? "às contas abaixo" : "à conta abaixo"} está suspenso. Seus dados estão preservados e
          o acesso volta assim que a conta for reativada.
        </p>
        <ul className="mt-5 space-y-2">
          {blocked.map((t) => (
            <li key={t.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[14px] font-medium text-slate-900">{t.name}</p>
              {t.suspension_reason && <p className="mt-0.5 text-[13px] text-slate-500">{t.suspension_reason}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[13px] text-slate-500">Para regularizar, fale com o suporte do {brand.name}.</p>
        <form action={signOut} className="mt-6">
          <button className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
