import { ArrowUpRight, BarChart3, BookOpen, Building2, ClipboardCheck, Globe2, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { requireUser, serverGet } from "@/lib/session";
import { formatDateTime, formatPercent } from "@/lib/format";
import { ResultBadge } from "@/components/result-badge";
import { ROLE_LABELS, type Paginated, type ResultList } from "@/lib/types";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/states";

async function count(path: string): Promise<number | null> {
  const data = await serverGet<Paginated<unknown>>(`/api/v1/${path}${path.includes("?") ? "&" : "?"}page_size=1`);
  return data ? data.count : null;
}

function Card({ href, label, value, icon: Icon, tint }: { href: string; label: string; value: number | null; icon: LucideIcon; tint: number }) {
  return (
    <Link
      href={href}
      className={`tint-${tint} group flex items-center gap-4 rounded-2xl border border-border-soft bg-surface p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--t-solid)] hover:shadow-md`}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--t-bg)] text-[var(--t-fg)]">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-muted">{label}</span>
        <span className="block text-3xl font-black tabular-nums tracking-tight">{value ?? "-"}</span>
      </span>
      <ArrowUpRight className="size-5 shrink-0 text-faint transition-colors group-hover:text-[var(--t-solid)]" aria-hidden="true" />
    </Link>
  );
}

export default async function PanelPage() {
  const user = await requireUser();
  const isAdmin = user.role === "superadmin" || user.role === "admin";
  const [branches, users, subjects, tests, published, recent] = await Promise.all([
    user.role === "superadmin" ? count("branches/") : null,
    isAdmin ? count("users/?is_active=true") : null,
    count("subjects/"),
    count("tests/"),
    count("tests/?status=published"),
    serverGet<ResultList>("/api/v1/results/?page_size=5"),
  ]);
  const name = `${user.first_name} ${user.last_name}`.trim() || user.username;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Xush kelibsiz, ${name}`}
        description={`${ROLE_LABELS[user.role]} - ${user.branch ? user.branch.name : "Barcha filiallar"}`}
        actions={
          <Link href="/panel/testlar" className={buttonClass("primary")}>
            Testlarni ochish
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {user.role === "superadmin" && <Card href="/panel/filiallar" label="Filiallar" value={branches} icon={Building2} tint={0} />}
        {isAdmin && <Card href="/panel/foydalanuvchilar" label="Faol foydalanuvchilar" value={users} icon={Users} tint={4} />}
        <Card href="/panel/fanlar" label="Fanlar" value={subjects} icon={BookOpen} tint={1} />
        <Card href="/panel/testlar" label="Testlar" value={tests} icon={ClipboardCheck} tint={3} />
        <Card href="/panel/testlar" label="E'lon qilingan testlar" value={published} icon={Globe2} tint={2} />
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <BarChart3 className="size-5 text-muted" aria-hidden="true" />
            So&apos;nggi natijalar
          </h2>
          <Link href="/panel/natijalar" className="text-sm font-bold text-accent hover:underline">
            Hammasi
          </Link>
        </div>
        {recent === null ? (
          <p className="text-sm text-muted">Natijalarni yuklab bo&apos;lmadi.</p>
        ) : recent.results.length === 0 ? (
          <p className="text-sm text-muted">Hozircha natija yo&apos;q. O&apos;quvchilar test topshirgach, shu yerda ko&apos;rinadi.</p>
        ) : (
          <ul className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface shadow-sm">
            {recent.results.map((r) => (
              <li key={r.id}>
                <Link href={`/panel/natijalar/${r.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 p-4 hover:bg-subtle">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{r.full_name}</span>
                    <span className="block truncate text-sm text-muted">
                      {r.test.title} · {formatDateTime(r.started_at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-bold tabular-nums">{formatPercent(r.percent)}</span>
                    <ResultBadge row={r} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
