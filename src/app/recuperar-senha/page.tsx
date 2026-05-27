import { AuthShell } from "@/components/auth/auth-shell";
import { RecoverForm } from "@/components/auth/recover-form";

export default function RecoverPasswordPage() {
  return (
    <AuthShell
      title="Recuperar acesso"
      subtitle="Enviamos um link seguro para redefinir a palavra-passe da sua conta."
    >
      <RecoverForm />
    </AuthShell>
  );
}
