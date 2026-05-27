import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      title="Criar empresa"
      subtitle="Abra a sua área no DataGeo Digital, crie o primeiro utilizador ADMIN e entre imediatamente."
    >
      <SignupForm />
    </AuthShell>
  );
}
