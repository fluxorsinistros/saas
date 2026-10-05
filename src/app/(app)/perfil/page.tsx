import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedAvatarUrls } from "@/lib/avatars";
import { AvatarUploader } from "@/components/profile/AvatarUploader";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("user_profiles").select("full_name, email, avatar_path").eq("id", user.id).maybeSingle();
  const name = profile?.full_name || profile?.email || user.email || "";
  const urls = await signedAvatarUrls([profile?.avatar_path]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto page-narrow space-y-6 px-4 py-6 md:px-8 md:py-8">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Meu perfil</h1>
          <p className="mt-1 max-w-xl text-[14px] text-slate-600">
            A foto é opcional e vale em todas as empresas em que você atua. Ela aparece ao lado do seu nome no menu e nos históricos.
            Só quem divide uma empresa com você consegue vê-la.
          </p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <AvatarUploader userId={user.id} name={name} url={profile?.avatar_path ? (urls.get(profile.avatar_path) ?? null) : null} />
          <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Nome</dt>
              <dd className="font-medium text-slate-900">{profile?.full_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">E-mail (login)</dt>
              <dd className="font-medium text-slate-900">{profile?.email || user.email}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
