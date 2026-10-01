import type { Metadata } from "next";
import { PlatformBrandMark } from "@/components/PlatformBrandMark";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <PlatformBrandMark tone="light" />
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
