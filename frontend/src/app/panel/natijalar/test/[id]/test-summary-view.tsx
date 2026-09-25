"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { formatPercent } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import type { QuestionAnalysis, TestResultSummary } from "@/lib/types";
import { RichHtml } from "@/components/rich-html";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/states";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="text-3xl font-black tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function QuestionRow({ q }: { q: QuestionAnalysis }) {
  const tone = q.correct_percent >= 70 ? "bg-success" : q.correct_percent >= 40 ? "bg-warning" : "bg-danger";
  return (
    <li className="space-y-3 rounded-2xl border border-border-soft bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-muted">{q.order}-savol</h3>
        <p className="text-sm font-bold tabular-nums">
          {q.correct_count}/{q.answered_count} to&apos;g&apos;ri · {formatPercent(q.correct_percent)}
        </p>
      </div>
      <RichHtml html={q.body_html} className="text-base font-semibold" />
      <div
        role="progressbar"
        aria-label="To'g'ri javob berish foizi"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={q.correct_percent}
        className="h-2.5 overflow-hidden rounded-full bg-subtle"
      >
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${q.correct_percent}%` }} />
      </div>
      {q.top_wrong_option && (
        <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm">
          <p className="font-bold text-danger">Eng ko&apos;p tanlangan noto&apos;g&apos;ri variant ({q.top_wrong_option.count} marta)</p>
          <RichHtml html={q.top_wrong_option.text_html} />
        </div>
      )}
    </li>
  );
}

export function TestSummaryView({ id }: { id: string }) {
  const { data, error, reload } = useFetch(`test-summary:${id}`, () => apiGet<TestResultSummary>(`/api/v1/results/tests/${id}/summary/`));

  const back = (
    <Link href="/panel/natijalar" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Natijalar
    </Link>
  );

  if (error && !data) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        {back}
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={data.test.title}
        description={`${data.test.subject} · natijalar va savollar tahlili`}
        actions={
          <Link href={`/panel/natijalar?test=${id}`} className={buttonClass("secondary", "sm")}>
            Barcha urinishlar
          </Link>
        }
      />
      {data.attempts === 0 ? (
        <EmptyState title="Bu testni hali hech kim topshirmagan" hint="Natijalar va savollar tahlili birinchi urinishdan keyin paydo bo'ladi." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Urinishlar" value={String(data.attempts)} />
            <Stat label="O'rtacha natija" value={formatPercent(data.avg_percent)} />
            <Stat label="O'tganlar" value={formatPercent(data.pass_rate)} />
          </div>
          <h2 className="text-xl font-extrabold">Savollar bo&apos;yicha</h2>
          <ul className="space-y-3">
            {data.questions.map((q) => (
              <QuestionRow key={q.question_id} q={q} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
