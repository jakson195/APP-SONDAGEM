"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SAAS_PLANS } from "@/lib/saas/plans";

type SubscriptionPayload = {
  company: { id: number; name: string; slug: string };
  subscription: {
    plan: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    maxObras: number;
    maxUsers: number;
  } | null;
  usage: { obras: number; users: number };
  access: { ok: boolean; message?: string; code?: string };
  billing: { stripeEnabled: boolean };
};

export function SubscriptionPanel({ checkoutHint }: { checkoutHint?: string }) {
  const [data, setData] = useState<SubscriptionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/subscription", { credentials: "include" });
      const json = (await res.json()) as SubscriptionPayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Falha ao carregar assinatura.");
        return;
      }
      setData(json);
    } catch {
      setError("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: "pro" }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Checkout indisponível.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Falha de rede.");
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Portal indisponível.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Falha de rede.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
        <div className="h-6 w-48 rounded bg-[var(--surface)]" />
        <div className="h-4 w-full max-w-md rounded bg-[var(--surface)]" />
        <div className="h-10 w-32 rounded bg-[var(--surface)]" />
      </div>
    );
  }

  const sub = data?.subscription;
  const proPlan = SAAS_PLANS.find((p) => p.id === "pro");

  return (
    <div className="space-y-6">
      {checkoutHint === "success" ? (
        <p className="rounded-lg bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
          Pagamento recebido. A assinatura será activada em instantes.
        </p>
      ) : null}
      {checkoutHint === "cancel" ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Checkout cancelado. Pode tentar novamente quando quiser.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-[var(--text)]">Assinatura actual</h2>
        {data?.company ? (
          <p className="mt-1 text-sm text-[var(--muted)]">{data.company.name}</p>
        ) : null}

        {sub ? (
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-[var(--muted)]">Plano</dt>
              <dd className="mt-1 text-lg font-semibold capitalize text-[var(--text)]">{sub.plan}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-[var(--muted)]">Estado</dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--text)]">{sub.status}</dd>
            </div>
            {sub.trialEndsAt ? (
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted)]">Trial até</dt>
                <dd className="mt-1 text-sm text-[var(--text)]">
                  {new Date(sub.trialEndsAt).toLocaleDateString("pt-BR")}
                </dd>
              </div>
            ) : null}
            {sub.currentPeriodEnd ? (
              <div>
                <dt className="text-xs font-medium uppercase text-[var(--muted)]">Período até</dt>
                <dd className="mt-1 text-sm text-[var(--text)]">
                  {new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium uppercase text-[var(--muted)]">Obras</dt>
              <dd className="mt-1 text-sm text-[var(--text)]">
                {data?.usage.obras ?? 0} / {sub.maxObras >= 999 ? "∞" : sub.maxObras}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-[var(--muted)]">Utilizadores</dt>
              <dd className="mt-1 text-sm text-[var(--text)]">
                {data?.usage.users ?? 0} / {sub.maxUsers >= 999 ? "∞" : sub.maxUsers}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">Sem registo de assinatura.</p>
        )}

        {data?.access && !data.access.ok ? (
          <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {(data.access as { message?: string }).message}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          {sub?.plan !== "pro" && sub?.plan !== "enterprise" ? (
            <button
              type="button"
              disabled={busy || !data?.billing.stripeEnabled}
              onClick={() => void startCheckout()}
              className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {data?.billing.stripeEnabled
                ? `Assinar ${proPlan?.name ?? "Pro"}`
                : "Stripe não configurado"}
            </button>
          ) : null}
          {data?.billing.stripeEnabled && sub?.plan === "pro" ? (
            <button
              type="button"
              disabled={busy || !data?.billing.stripeEnabled}
              onClick={() => void openPortal()}
              className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
            >
              Gerir pagamento
            </button>
          ) : null}
          <Link
            href="/planos"
            className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text)]"
          >
            Comparar planos
          </Link>
        </div>
      </div>
    </div>
  );
}
