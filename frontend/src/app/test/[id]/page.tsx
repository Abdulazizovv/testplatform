import { Clock, HelpCircle, Target } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { RichHtml } from "@/components/rich-html";
import { formatLimit } from "@/lib/format";
import { publicGet } from "@/lib/public-server";
import type { PublicTestDetail } from "@/lib/public-types";
import { StartForm } from "./start-form";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return null;
  return publicGet<PublicTestDetail>(`/api/v1/public/tests/${id}/`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const test = await load((await params).id);
  return { title: test ? test.title : "Test" };
}

export default async function TestPage({ params }: Props) {
  const test = await load((await params).id);
  if (!test) notFound();

  const facts = [
    { label: "Savollar", value: `${test.question_count} ta`, icon: HelpCircle, tint: 0 },
    { label: "Vaqt", value: formatLimit(test.time_limit_sec), icon: Clock, tint: 3 },
    { label: "O'tish foizi", value: `${test.pass_percent}%`, icon: Target, tint: 1 },
  ];

  return (
    <PublicShell
      narrow
      crumbs={[
        { label: "Filiallar", href: "/" },
        { label: test.branch.name, href: `/filial/${test.branch.slug}` },
        { label: test.subject.name, href: `/filial/${test.branch.slug}/${test.subject.slug}` },
        { label: test.title },
      ]}
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-black leading-tight tracking-tight md:text-4xl">{test.title}</h1>
          <RichHtml html={test.description_html} className="text-base text-muted" />
        </div>
        <dl className="grid grid-cols-3 gap-2 md:gap-3">
          {facts.map(({ label, value, icon: Icon, tint }) => (
            <div key={label} className={`tint-${tint} rounded-2xl border-2 border-border-soft bg-surface p-3 shadow-sm md:p-4`}>
              <span className="mb-2 flex size-9 items-center justify-center rounded-xl bg-[var(--t-bg)] text-[var(--t-fg)]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <dt className="text-xs font-semibold text-muted">{label}</dt>
              <dd className="mt-0.5 text-base font-extrabold leading-tight md:text-lg">{value}</dd>
            </div>
          ))}
        </dl>
        <StartForm testId={test.id} timed={test.time_limit_sec !== null} />
      </div>
    </PublicShell>
  );
}
