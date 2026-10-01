"use client";

import { OtpPasswordForm } from "@/components/auth/OtpPasswordForm";

export function ConfirmInviteForm({ initialEmail }: { initialEmail: string }) {
  return (
    <OtpPasswordForm
      initialEmail={initialEmail}
      otpType="email"
      title="Confirmar convite"
      codeFooter="Não recebeu ou o código expirou? Peça ao administrador para reenviar o convite."
    />
  );
}
