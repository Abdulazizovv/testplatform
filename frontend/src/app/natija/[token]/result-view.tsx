"use client";

import { AlertCircle, CheckCircle2, CircleDashed, Home, Lightbulb, Trophy, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Confetti } from "@/components/public/confetti";
import { PublicShell } from "@/components/public/public-shell";
import { RichHtml } from "@/components/rich-html";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Notice, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { getResult } from "@/lib/public-client";
import type { AttemptResult, ReviewItem } from "@/lib/public-types";

export function ResultView({ token }: { token: string }) {
  const router = useRouter();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    getResult(token)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 409) router.replace(`/yechish/${token}`); // still running
        else setError(e instanceof ApiError ? e : new ApiError(0, "Xatolik yuz berdi."));
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (error) {
    return (
      <PublicShell narrow>
        <div role="alert" className="space-y-4 rounded-3xl border-2 border-border-soft bg-surface p-6 text-center shadow-md">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <AlertCircle className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-extrabold">{error.status === 404 ? "Natija topilmadi" : "Natijani yuklab bo'lmadi"}</h1>
          <p className="text-muted">
            {error.status === 404 ? "Havola noto'g'ri yoki eskirgan bo'lishi mumkin." : error.message}
          </p>
          <Link href="/" className={buttonClass("primary")}>
            Bosh sahifa
          </Link>
        </div>
      </PublicShell>
    );
  }
  if (!result) {
    return (
      <PublicShell narrow>
        <div role="status" aria-label="Natija yuklanmoqda" className="space-y-4 pt-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-72 w-full rounded-3xl" />
          <span className="sr-only">Natija yuklanmoqda...</span>
        </div>
      </PublicShell>
    );
  }

  const hasScore = result.percent !== undefined;
  return (
    <PublicShell narrow={!result.items}>
      {hasScore && result.passed && <Confetti />}
      <div className="space-y-6">
        {result.status === "expired" && (
          <Notice tone="warning">Vaqt tugadi. Tugagunga qadar saqlangan javoblaringiz hisoblandi.</Notice>
        )}

        {hasScore ? (
          <section aria-label="Natija" className={cn("anim-rise overflow-hidden rounded-3xl border-2 bg-surface shadow-lg", result.passed ? "border-success-line" : "border-warning-line")}>
            <div className={cn("flex flex-col items-center gap-5 px-5 pb-6 pt-8 text-center", result.passed ? "bg-success-soft" : "bg-warning-soft")}>
              <ScoreRing percent={result.percent!} passed={!!result.passed} />
              <div className="space-y-2">
                <Badge tone={result.passed ? "success" : "warning"} className="border border-current/20 bg-surface px-3.5 py-1 text-sm">
                  {result.passed ? <Trophy className="size-4" aria-hidden="true" /> : <CircleDashed className="size-4" aria-hidden="true" />}
                  {result.passed ? "O'tdi" : "O'tmadi"}
                </Badge>
                <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                  {result.passed ? `Tabriklaymiz, ${firstName(result.full_name)}!` : `${firstName(result.full_name)}, yaxshi urinish!`}
                </h1>
                <p className="text-sm font-semibold text-muted">{result.test.title}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 divide-x divide-border-soft border-t border-border-soft text-center">
              <div className="px-3 py-4">
                <dt className="text-sm font-semibold text-muted">Ball</dt>
                <dd className="text-2xl font-extrabold tabular-nums">
                  {result.score} / {result.max_score}
                </dd>
              </div>
              <div className="px-3 py-4">
                <dt className="text-sm font-semibold text-muted">O&apos;tish foizi</dt>
                <dd className="text-2xl font-extrabold tabular-nums">{result.pass_percent}%</dd>
              </div>
            </dl>
          </section>
        ) : (
          <section aria-label="Natija" className="anim-rise space-y-3 rounded-3xl border-2 border-border-soft bg-surface p-7 text-center shadow-lg">
            <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-success-soft text-success">
              <CheckCircle2 className="size-9" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-black tracking-tight">Test yakunlandi</h1>
            <p className="text-sm font-semibold text-muted">{result.test.title}</p>
            <p className="text-muted">{firstName(result.full_name)}, javoblaringiz qabul qilindi. Natija bu yerda ko&apos;rsatilmaydi.</p>
          </section>
        )}

        <p className="text-center text-sm text-muted">
          Bu sahifaning havolasini saqlab qo&apos;ysangiz, natijani keyinroq ham ko&apos;rishingiz mumkin.
        </p>

        {result.items && (
          <section aria-labelledby="review" className="space-y-4">
            <h2 id="review" className="text-2xl font-extrabold tracking-tight">
              Javoblarni ko&apos;rib chiqish
            </h2>
            <ol className="space-y-4">
              {result.items.map((item) => (
                <ReviewCard key={item.order} item={item} />
              ))}
            </ol>
          </section>
        )}

        <Link href="/" className={buttonClass("primary", "lg", "w-full")}>
          <Home className="size-5" aria-hidden="true" />
          Boshqa test yechish
        </Link>
      </div>
    </PublicShell>
  );
}

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? full;
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Progress ring; the arc animates from empty on mount (instant with reduced motion). */
function ScoreRing({ percent, passed }: { percent: number; passed: boolean }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  const r = 78;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="relative size-48 md:size-56" role="img" aria-label={`Natija: ${formatPercent(percent)} foiz`}>
      <svg viewBox="0 0 180 180" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface)" strokeWidth="16" />
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke={passed ? "var(--success)" : "var(--warning)"}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={drawn ? c * (1 - clamped / 100) : c}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black tabular-nums tracking-tight md:text-6xl">
          {formatPercent(percent)}
          <span className="text-2xl md:text-3xl">%</span>
        </span>
      </div>
    </div>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const state = !item.answered ? "skipped" : item.is_correct ? "correct" : "wrong";
  const verdict = {
    skipped: { tone: "neutral" as const, text: "Javob berilmagan", Icon: CircleDashed, bar: "bg-border" },
    correct: { tone: "success" as const, text: "To'g'ri", Icon: CheckCircle2, bar: "bg-success" },
    wrong: { tone: "danger" as const, text: "Noto'g'ri", Icon: XCircle, bar: "bg-danger" },
  }[state];
  return (
    <li className="relative space-y-4 overflow-hidden rounded-3xl border-2 border-border-soft bg-surface p-5 pl-6 shadow-sm">
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1.5", verdict.bar)} />
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-muted">{item.order}-savol</h3>
        <Badge tone={verdict.tone} className="px-3 py-1 text-sm">
          <verdict.Icon className="size-4" aria-hidden="true" />
          {verdict.text}
        </Badge>
      </div>
      <RichHtml html={item.body_html} className="text-lg font-semibold" />
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="max-h-80 w-auto max-w-full rounded-2xl" />
      )}
      <ul className="space-y-2">
        {item.options.map((option) => (
          <li
            key={option.id}
            className={cn(
              "flex items-start gap-3 rounded-2xl border-2 px-3.5 py-3",
              option.is_correct ? "border-success-line bg-success-soft" : option.selected ? "border-danger-line bg-danger-soft" : "border-border-soft",
            )}
          >
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {option.is_correct ? (
                <CheckCircle2 className="size-6 text-success" />
              ) : option.selected ? (
                <XCircle className="size-6 text-danger" />
              ) : (
                <span className="block size-6 rounded-full border-2 border-border" />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <RichHtml html={option.text_html} className="text-base" />
              {option.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={option.image_url} alt="" className="max-h-48 w-auto max-w-full rounded-xl" />
              )}
              {(option.selected || option.is_correct) && (
                <p className="flex flex-wrap gap-x-3 text-xs font-extrabold">
                  {option.selected && <span className="text-foreground">Sizning javobingiz</span>}
                  {option.is_correct && <span className="text-success">To&apos;g&apos;ri javob</span>}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {item.explanation_html && (
        <div className="flex gap-3 rounded-2xl bg-accent-soft px-4 py-3">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p className="mb-1 text-sm font-extrabold text-accent">Izoh</p>
            <RichHtml html={item.explanation_html} className="text-base" />
          </div>
        </div>
      )}
    </li>
  );
}
