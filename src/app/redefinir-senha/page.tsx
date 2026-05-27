import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Definir nova palavra-passe"
      subtitle="Use o link recebido por email para criar uma nova credencial de acesso."
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
