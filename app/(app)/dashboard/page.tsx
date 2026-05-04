import Link from "next/link";
import { ArrowRight, MapPin, FolderOpen, Users } from "lucide-react";
import { demoProjects } from "@/lib/demo-projects";

export default function DashboardPage() {
  const count = demoProjects.length;
  const clients = new Set(demoProjects.map((p) => p.client)).size;
  const locations = new Set(demoProjects.map((p) => p.location)).size;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Overview of your geotechnical drilling operations.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent)]">
              <FolderOpen className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-[var(--text)]">
                {count}
              </p>
              <p className="text-sm text-[var(--muted)]">Active projects</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MapPin className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-[var(--text)]">
                {locations}
              </p>
              <p className="text-sm text-[var(--muted)]">Locations</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Users className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-[var(--text)]">
                {clients}
              </p>
              <p className="text-sm text-[var(--muted)]">Clients</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex flex-col gap-2 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text)]">
              Recent projects
            </h2>
            <p className="text-sm text-[var(--muted)]">
              Latest entries across your portfolio.
            </p>
          </div>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {demoProjects.slice(0, 3).map((p) => (
            <li key={p.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-[var(--text)]">{p.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {p.location} · {p.client}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
