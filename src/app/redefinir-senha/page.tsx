import type { Metadata } from "next";
import { PlatformBrandMark } from "@/components/PlatformBrandMark";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Definir senha" };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <PlatformBrandMark tone="light" />
        <ResetPasswordForm />
      </div>
    </main>
  );
}
