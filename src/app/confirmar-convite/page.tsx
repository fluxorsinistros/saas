import type { Metadata } from "next";
import { PlatformBrandMark } from "@/components/PlatformBrandMark";
import { ConfirmInviteForm } from "./ConfirmInviteForm";

export const metadata: Metadata = { title: "Confirmar convite" };

export default async function ConfirmInvitePage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <main className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <PlatformBrandMark tone="light" />
        <ConfirmInviteForm initialEmail={email ?? ""} />
      </div>
    </main>
  );
}
