import { ArrowRight, ChevronRight, LogIn } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/components/ui/cn";

export interface Crumb {
  label: string;
  href?: string;
}

/** Page frame of the student flow: header (brand, theme, staff link), optional breadcrumb, content. */
export function PublicShell({
  crumbs,
  children,
  narrow,
}: {
  crumbs?: Crumb[];
  children: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="bg-playful min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border-soft bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-2">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-xl" aria-label="Bilim sinovi, bosh sahifa">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Link
              href="/kirish"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-muted transition-colors hover:bg-subtle hover:text-foreground md:min-h-10"
            >
              <LogIn className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Xodimlar uchun kirish</span>
              <span className="sm:hidden">Kirish</span>
            </Link>
          </div>
        </div>
      </header>
      <main className={cn("mx-auto w-full px-4 pb-20 pt-4", narrow ? "max-w-xl" : "max-w-5xl")}>
        {crumbs && crumbs.length > 0 && <Breadcrumb crumbs={crumbs} />}
        {children}
      </main>
    </div>
  );
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Yo'nalish" className="mb-3">
      <ol className="flex flex-wrap items-center gap-x-0.5 text-sm font-semibold text-muted">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-0.5">
              {crumb.href && !last ? (
                <Link href={crumb.href} className="inline-flex min-h-11 items-center rounded-lg px-1.5 transition-colors hover:bg-subtle hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="inline-flex min-h-11 max-w-[14rem] items-center truncate px-1.5 text-foreground">
                  {crumb.label}
                </span>
              )}
              {!last && <ChevronRight className="size-4 text-faint" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageIntro({ title, text, icon, tint = 0 }: { title: string; text?: string; icon?: React.ReactNode; tint?: number }) {
  return (
    <div className={cn("flex items-center gap-4 pb-6", `tint-${tint % 6}`)}>
      {icon && (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--t-bg)] text-[var(--t-fg)] md:size-16">{icon}</span>
      )}
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
        {text && <p className="text-base text-muted md:text-lg">{text}</p>}
      </div>
    </div>
  );
}

/** A big tappable card that links somewhere (branch / subject / test). `tint` picks a soft accent color. */
export function LinkCard({
  href,
  title,
  meta,
  icon,
  tint = 0,
  cta,
  children,
}: {
  href: string;
  title: string;
  meta?: string;
  icon?: React.ReactNode;
  tint?: number;
  cta?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full min-h-24 items-center gap-4 rounded-2xl border-2 border-border-soft bg-surface p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--t-solid)] hover:shadow-md active:translate-y-0 active:scale-[0.99] md:p-5",
        `tint-${tint % 6}`,
      )}
    >
      {icon && (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--t-bg)] text-[var(--t-fg)] transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3 md:size-16">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-lg font-extrabold leading-snug tracking-tight">{title}</span>
        {meta && <span className="block text-sm text-muted">{meta}</span>}
        {children}
      </span>
      {cta ? (
        <span className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-[var(--t-bg)] px-3.5 py-2 text-sm font-extrabold text-[var(--t-fg)] sm:inline-flex">
          {cta}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      ) : null}
      <ChevronRight className={cn("size-6 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--t-solid)]", cta && "sm:hidden")} aria-hidden="true" />
    </Link>
  );
}

/** Small info pill: icon + text. */
export function Chip({ icon, children, className }: { icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs font-bold text-muted", className)}>
      {icon}
      {children}
    </span>
  );
}
