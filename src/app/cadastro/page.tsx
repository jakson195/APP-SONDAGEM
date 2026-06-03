import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      title="Criar empresa"
      subtitle="Abra a sua área no DataGeo Digital, crie o primeiro utilizador ADMIN e entre imediatamente."
    >
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">A carregar formulário…</p>}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
