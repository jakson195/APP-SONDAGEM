import Link from "next/link";
import { SptRegistroCampo } from "@/components/spt-registro-campo";

export default function SptLocalPage() {
  return (
    <div>
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-3 print:hidden">
        <p className="text-sm text-[var(--muted)]">
          <strong className="text-[var(--text)]">Modo local</strong> — os metros
          de SPT não são guardados no servidor. Para{" "}
          <strong className="text-[var(--text)]">SPT 01, SPT 02</strong> na mesma
          obra com persistência, use{" "}
          <Link
            href="/spt"
            className="font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            o hub SPT
          </Link>
          .
        </p>
      </div>
      <SptRegistroCampo />
    </div>
  );
}
