"use client";

import { ArrowLeft, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/format";
import { useFetch } from "@/lib/hooks";
import type { ResultDetail, ResultItem } from "@/lib/types";
import { RichHtml } from "@/components/rich-html";
import { ResultBadge } from "@/components/result-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ErrorState, Loading, PageHeader } from "@/components/ui/states";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="text-xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function ItemCard({ item }: { item: ResultItem }) {
  const state = !item.answered ? "skipped" : item.is_correct ? "correct" : "wrong";
  const verdict = {
    skipped: { tone: "neutral" as const, text: "Javob berilmagan", Icon: CircleDashed, bar: "bg-border" },
    correct: { tone: "success" as const, text: "To'g'ri", Icon: CheckCircle2, bar: "bg-success" },
    wrong: { tone: "danger" as const, text: "Noto'g'ri", Icon: XCircle, bar: "bg-danger" },
  }[state];
  return (
    <li className="relative space-y-3 overflow-hidden rounded-2xl border border-border-soft bg-surface p-4 pl-5 shadow-sm">
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1.5", verdict.bar)} />
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-muted">
          {item.order}-savol · {item.points_awarded}/{item.points} ball
        </h3>
        <Badge tone={verdict.tone}>
          <verdict.Icon className="size-4" aria-hidden="true" />
          {verdict.text}
        </Badge>
      </div>
      <RichHtml html={item.body_html} className="text-base font-semibold" />
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="max-h-64 w-auto max-w-full rounded-xl" />
      )}
      <ul className="space-y-2">
        {item.options.map((o) => (
          <li
            key={o.id}
            className={cn(
              "flex flex-wrap items-start justify-between gap-2 rounded-xl border-2 px-3 py-2.5",
              o.is_correct ? "border-success-line bg-success-soft" : o.selected ? "border-danger-line bg-danger-soft" : "border-border-soft",
            )}
          >
            <div className="min-w-0 flex-1">
              <RichHtml html={o.text_html} />
              {o.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.image_url} alt="" className="mt-1 max-h-32 w-auto max-w-full rounded-lg" />
              )}
            </div>
            <span className="flex shrink-0 gap-1.5">
              {o.selected && <Badge tone={o.is_correct ? "success" : "danger"}>Tanlangan</Badge>}
              {o.is_correct && <Badge tone="success">To&apos;g&apos;ri javob</Badge>}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

export function AttemptView({ id }: { id: string }) {
  const { data, error, reload } = useFetch(`result:${id}`, () => apiGet<ResultDetail>(`/api/v1/results/${id}/`));

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
        title={data.full_name}
        description={`${data.age} yosh · ${data.test.title} · ${data.subject.name} · ${data.branch.name}`}
        actions={
          <>
            <ResultBadge row={data} />
            <Link href={`/panel/natijalar/test/${data.test.id}`} className={buttonClass("secondary", "sm")}>
              Test tahlili
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Ball" value={data.score === null ? "—" : `${data.score}/${data.max_score}`} />
        <Fact label={`Foiz (o'tish: ${data.pass_percent}%)`} value={formatPercent(data.percent)} />
        <Fact label="Sarflangan vaqt" value={formatDuration(data.duration_sec)} />
        <Fact label="Boshlangan" value={formatDateTime(data.started_at)} />
      </div>
      {data.finished_at && <p className="text-sm text-muted">Tugagan: {formatDateTime(data.finished_at)}</p>}
      <ul className="space-y-3">
        {data.items.map((item) => (
          <ItemCard key={item.order} item={item} />
        ))}
      </ul>
    </div>
  );
}
