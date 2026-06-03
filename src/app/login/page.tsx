import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthBypassEnabled } from "@/lib/auth-bypass";

type Props = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  if (isAuthBypassEnabled()) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const next =
    typeof params.next === "string" &&
    params.next.startsWith("/") &&
    !params.next.startsWith("//")
      ? params.next
      : "/dashboard";

  return (
    <AuthShell
      title="Entrar na plataforma"
      subtitle="Aceda ao dashboard, às empresas e aos portais de cliente com um único login."
      footer={
        <>
          <Link href="/" className="font-medium text-[var(--accent)] hover:underline">
            ← Site comercial
          </Link>
          {" · "}
          O acesso ao dashboard exige autenticação.{" "}
          <Link href="/login?next=/adm" className="font-medium text-[var(--accent)] hover:underline">
            ADM mestre
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
