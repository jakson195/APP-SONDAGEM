import { ClientPortalShell } from "@/components/client-portal-shell";
import { requireClientPortalPageAccess } from "@/lib/client-portal-auth";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function ClientPortalLayout({
  children,
  params,
}: LayoutProps) {
  const { slug } = await params;
  const access = await requireClientPortalPageAccess(slug);

  return (
    <ClientPortalShell company={access.company} user={access.user}>
      {children}
    </ClientPortalShell>
  );
}
