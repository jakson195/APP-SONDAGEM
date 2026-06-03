import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Definir nova palavra-passe"
      subtitle="Use o link recebido por email para criar uma nova credencial de acesso."
    >
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">A carregar…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
