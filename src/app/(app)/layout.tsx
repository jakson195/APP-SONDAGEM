import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ObraModulosProvider } from "@/components/obra-context";
import { isLocalAuthBypassEnabled } from "@/lib/auth-bypass";
import { getActiveCompanyContext } from "@/lib/auth/active-company";
import { assertSubscriptionAllowsAccess } from "@/lib/saas/subscription-service";
import { getAuthUserFromCookies } from "@/lib/server-auth";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const company = await getActiveCompanyContext(user);
  const access =
    isLocalAuthBypassEnabled() || company == null
      ? { ok: true as const }
      : await assertSubscriptionAllowsAccess(company.companyId);

  return (
    <ObraModulosProvider>
      {!access.ok ? (
        <div className="border-b border-amber-400/50 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
          {access.message}{" "}
          <Link href="/assinatura" className="font-semibold underline">
            Gerir assinatura
          </Link>
        </div>
      ) : null}
      <AppShell>{children}</AppShell>
    </ObraModulosProvider>
  );
}
