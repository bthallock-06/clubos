/** Small presentational building blocks shared by every screen. */
import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ink" | "ok" | "bad" | "warn";
}) {
  const color = { ink: "text-ink", ok: "text-ok", bad: "text-bad", warn: "text-warn" }[tone];
  return (
    <div className="rounded-xl border border-line bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`num mt-1.5 text-2xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

type Tone = "ok" | "warn" | "bad" | "neutral" | "brand";
const TONES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-paper text-muted",
  brand: "bg-brand-soft text-brand-dark",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">{head}</thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const th = "px-5 py-2.5 font-medium whitespace-nowrap";
export const td = "px-5 py-3 align-middle";
export const tdNum = `${td} num text-right whitespace-nowrap`;
export const thNum = `${th} text-right`;

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted">{children}</p>;
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const input =
  "h-9 w-full rounded-md border border-line bg-white px-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft";

export function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-sm font-medium hover:bg-paper"
    >
      {children}
    </Link>
  );
}

/** Horizontal bar showing part of a whole. Purely decorative next to a number. */
export function Meter({ value, total, tone = "brand" }: { value: number; total: number; tone?: "brand" | "bad" | "warn" }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  const color = { brand: "bg-brand", bad: "bg-bad", warn: "bg-warn" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper" aria-hidden>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Shown in place of a form that needs at least one team to exist. */
export function NeedsTeam({ action }: { action: string }) {
  return (
    <p className="p-5 text-sm text-muted">
      Create a team first, then you can {action}.{" "}
      <Link href="/teams" className="font-medium text-brand hover:underline">
        Go to Teams
      </Link>
    </p>
  );
}
