import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ObraModulosProvider } from "@/components/obra-context";
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

  return (
    <ObraModulosProvider>
      <AppShell>{children}</AppShell>
    </ObraModulosProvider>
  );
}
