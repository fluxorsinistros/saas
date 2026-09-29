import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/BrandMark";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Configurar empresa" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, tenants(onboarding_completed_at)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (memberships?.length) {
    const pending = memberships.find((m) => !m.tenants?.onboarding_completed_at);
    redirect(pending ? "/onboarding/wizard" : "/fluxos");
  }

  return (
    <main className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <BrandMark tone="light" />
        <h1 className="mt-10 text-[22px] font-semibold tracking-tight text-slate-900">Vamos configurar sua empresa</h1>
        <p className="mt-1 text-[14px] text-slate-500">
          Criamos o seu ambiente com grupos operacionais sugeridos (Regulação, Jurídico, Financeiro…). Você pode ajustar tudo
          depois.
        </p>
        <OnboardingForm />
      </div>
    </main>
  );
}
