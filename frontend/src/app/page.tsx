import { ArrowDown, BookOpen, Building2, ClipboardCheck, MapPin, Sparkles, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { LinkCard, PublicShell } from "@/components/public/public-shell";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { publicList } from "@/lib/public-server";
import type { PublicBranch } from "@/lib/public-types";

export const metadata: Metadata = { title: "Bilimingizni sinab ko'ring" };

const STEPS = [
  { icon: Building2, label: "Filial", tint: 0 },
  { icon: BookOpen, label: "Fan", tint: 1 },
  { icon: ClipboardCheck, label: "Test", tint: 3 },
];

export default async function HomePage() {
  const branches = await publicList<PublicBranch>("/api/v1/public/branches/");

  return (
    <PublicShell>
      <section className="grid items-center gap-8 pb-10 pt-4 md:grid-cols-[1.15fr_0.85fr] md:pb-14 md:pt-10">
        <div className="space-y-6">
          <h1 className="text-4xl font-black leading-[1.08] tracking-tight md:text-6xl">
            Bilimingizni <span className="text-accent">sinab ko&apos;ring</span>
          </h1>
          <p className="max-w-xl text-lg text-muted md:text-xl">
            Filialingizni tanlang, fanni belgilang va testni yeching. Savollar birma-bir chiqadi, javoblaringiz avtomatik saqlanadi.
          </p>
          <ol className="flex flex-wrap items-center gap-2" aria-label="Qadamlar">
            {STEPS.map(({ icon: Icon, label, tint }, i) => (
              <li key={label} className={`tint-${tint} flex items-center gap-2 rounded-full bg-[var(--t-bg)] py-1.5 pl-2 pr-4 text-sm font-extrabold text-[var(--t-fg)]`}>
                <span className="flex size-7 items-center justify-center rounded-full bg-[var(--t-solid)] text-surface">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {i + 1}. {label}
              </li>
            ))}
          </ol>
          <a href="#filiallar" className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
            Filialni tanlash
            <ArrowDown className="size-5" aria-hidden="true" />
          </a>
        </div>

        <div aria-hidden="true" className="relative mx-auto hidden h-72 w-full max-w-sm md:block">
          <div className="tint-0 anim-float absolute left-2 top-4 flex size-32 rotate-[-8deg] items-center justify-center rounded-3xl bg-[var(--t-bg)] text-[var(--t-solid)] shadow-lg">
            <ClipboardCheck className="size-16" strokeWidth={1.6} />
          </div>
          <div className="tint-3 anim-float absolute right-0 top-0 flex size-24 rotate-[10deg] items-center justify-center rounded-3xl bg-[var(--t-bg)] text-[var(--t-solid)] shadow-md [animation-delay:-1.5s]">
            <Sparkles className="size-12" strokeWidth={1.6} />
          </div>
          <div className="tint-1 anim-float absolute bottom-2 right-6 flex size-36 rotate-[6deg] items-center justify-center rounded-3xl bg-[var(--t-bg)] text-[var(--t-solid)] shadow-lg [animation-delay:-3s]">
            <Trophy className="size-[4.5rem]" strokeWidth={1.6} />
          </div>
          <div className="tint-2 anim-float absolute bottom-6 left-10 flex size-20 rotate-[-12deg] items-center justify-center rounded-3xl bg-[var(--t-bg)] text-[var(--t-solid)] shadow-md [animation-delay:-4s]">
            <BookOpen className="size-10" strokeWidth={1.6} />
          </div>
        </div>
      </section>

      <section id="filiallar" aria-labelledby="branches-title" className="scroll-mt-24 space-y-4">
        <h2 id="branches-title" className="text-2xl font-extrabold tracking-tight md:text-3xl">
          Filialingizni tanlang
        </h2>
        {branches.length === 0 ? (
          <EmptyState title="Hozircha faol filial yo'q" hint="Iltimos, keyinroq qayta urinib ko'ring." icon={<Building2 className="size-7" aria-hidden="true" />} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 md:gap-4">
            {branches.map((branch, i) => (
              <li key={branch.id} className="anim-rise" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
                <LinkCard
                  href={`/filial/${branch.slug}`}
                  title={branch.name}
                  tint={i}
                  icon={<Building2 className="size-7" aria-hidden="true" />}
                  meta={undefined}
                >
                  {branch.address && (
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <MapPin className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{branch.address}</span>
                    </span>
                  )}
                </LinkCard>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PublicShell>
  );
}
