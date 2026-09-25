import { BookOpen, ClipboardCheck, Clock, HelpCircle, Play, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, PageIntro, PublicShell } from "@/components/public/public-shell";
import { EmptyState } from "@/components/ui/states";
import { formatLimit } from "@/lib/format";
import { publicGet, publicList } from "@/lib/public-server";
import type { PublicSubjectDetail, PublicTest } from "@/lib/public-types";

type Props = { params: Promise<{ slug: string; fan: string }> };

const subjectPath = (slug: string, fan: string) =>
  `/api/v1/public/branches/${encodeURIComponent(slug)}/subjects/${encodeURIComponent(fan)}/`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, fan } = await params;
  const subject = await publicGet<PublicSubjectDetail>(subjectPath(slug, fan));
  return { title: subject ? subject.name : "Fan" };
}

export default async function SubjectPage({ params }: Props) {
  const { slug, fan } = await params;
  const subject = await publicGet<PublicSubjectDetail>(subjectPath(slug, fan));
  if (!subject) notFound();
  const tests = await publicList<PublicTest>(`/api/v1/public/subjects/${subject.id}/tests/`);

  return (
    <PublicShell
      crumbs={[
        { label: "Filiallar", href: "/" },
        { label: subject.branch.name, href: `/filial/${subject.branch.slug}` },
        { label: subject.name },
      ]}
    >
      <PageIntro title={subject.name} text={subject.description || "Testni tanlang."} icon={<BookOpen className="size-8" aria-hidden="true" />} tint={1} />
      {tests.length === 0 ? (
        <EmptyState title="Bu fanda hozircha test yo'q" hint="Testlar e'lon qilingach, shu yerda paydo bo'ladi." icon={<ClipboardCheck className="size-7" aria-hidden="true" />} />
      ) : (
        <ul className="grid gap-3 md:gap-4">
          {tests.map((test, i) => (
            <li key={test.id} className="anim-rise" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <Link
                href={`/test/${test.id}`}
                className="tint-3 group flex flex-col gap-4 rounded-2xl border-2 border-border-soft bg-surface p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--t-solid)] hover:shadow-md active:scale-[0.99] sm:flex-row sm:items-center md:p-5"
              >
                <span className="flex min-w-0 flex-1 items-start gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--t-bg)] text-[var(--t-fg)]">
                    <ClipboardCheck className="size-6" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 space-y-2">
                    <span className="block text-lg font-extrabold leading-snug tracking-tight">{test.title}</span>
                    <span className="flex flex-wrap gap-2">
                      <Chip icon={<HelpCircle className="size-3.5" aria-hidden="true" />}>{test.question_count} ta savol</Chip>
                      <Chip icon={<Clock className="size-3.5" aria-hidden="true" />}>
                        {test.time_limit_sec === null ? "Vaqt cheklanmagan" : formatLimit(test.time_limit_sec)}
                      </Chip>
                      <Chip icon={<Target className="size-3.5" aria-hidden="true" />}>O&apos;tish: {test.pass_percent}%</Chip>
                    </span>
                  </span>
                </span>
                <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-base font-bold text-accent-foreground shadow-sm transition-colors group-hover:bg-accent-hover sm:shrink-0">
                  <Play className="size-4 fill-current" aria-hidden="true" />
                  Ochish
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
