import { AppShell } from "@/components/app-shell";
import { ObraModulosProvider } from "@/components/obra-context";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ObraModulosProvider>
      <AppShell>{children}</AppShell>
    </ObraModulosProvider>
  );
}
