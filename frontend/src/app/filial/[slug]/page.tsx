import { BookOpen, Building2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkCard, PageIntro, PublicShell } from "@/components/public/public-shell";
import { EmptyState } from "@/components/ui/states";
import { publicGet, publicList } from "@/lib/public-server";
import type { PublicBranch, PublicSubject } from "@/lib/public-types";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const branch = await publicGet<PublicBranch>(`/api/v1/public/branches/${encodeURIComponent(slug)}/`);
  return { title: branch ? branch.name : "Filial" };
}

export default async function BranchPage({ params }: Props) {
  const { slug } = await params;
  const branch = await publicGet<PublicBranch>(`/api/v1/public/branches/${encodeURIComponent(slug)}/`);
  if (!branch) notFound();
  const subjects = await publicList<PublicSubject>(`/api/v1/public/branches/${encodeURIComponent(slug)}/subjects/`);

  return (
    <PublicShell crumbs={[{ label: "Filiallar", href: "/" }, { label: branch.name }]}>
      <PageIntro title={branch.name} text="Qaysi fandan test yechmoqchisiz?" icon={<Building2 className="size-8" aria-hidden="true" />} />
      {subjects.length === 0 ? (
        <EmptyState title="Bu filialda hozircha test yo'q" hint="Testlar e'lon qilingach, shu yerda paydo bo'ladi." icon={<BookOpen className="size-7" aria-hidden="true" />} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 md:gap-4">
          {subjects.map((subject, i) => (
            <li key={subject.id} className="anim-rise" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <LinkCard
                href={`/filial/${branch.slug}/${subject.slug}`}
                title={subject.name}
                tint={i + 1}
                icon={<BookOpen className="size-7" aria-hidden="true" />}
                meta={`${subject.test_count} ta test`}
              />
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
