"use client";

import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiDelete, apiGet, apiGetAll, apiPost } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { problemsOfQuestion } from "@/lib/question-rules";
import { TEST_STATUS_LABELS, type CurrentUser, type QuestionItem, type TestItem } from "@/lib/types";
import { QuestionEditor } from "@/components/question-editor";
import { RichHtml } from "@/components/rich-html";
import { TestActions, statusTone } from "@/components/test-actions";
import { TestForm } from "@/components/test-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState, Loading, Notice } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

type Mode = { kind: "list" } | { kind: "edit"; question: QuestionItem | null; nonce: number };

const TYPE_LABEL = { single: "Bitta javob", multiple: "Ko'p javob", text: "Yoziladigan" } as const;

function Arrow({ dir }: { dir: "up" | "down" }) {
  return dir === "up" ? <ChevronUp className="size-5" aria-hidden="true" /> : <ChevronDown className="size-5" aria-hidden="true" />;
}

export function TestEditor({ me, testId }: { me: CurrentUser; testId: string }) {
  const router = useRouter();
  const toast = useToast();
  const testState = useFetch(`test:${testId}`, () => apiGet<TestItem>(`/api/v1/tests/${testId}/`));
  const questionsState = useFetch(`test-questions:${testId}`, () => apiGetAll<QuestionItem>(`/api/v1/tests/${testId}/questions/`));
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [settings, setSettings] = useState(false);
  const [deleting, setDeleting] = useState<QuestionItem | null>(null);
  const [moving, setMoving] = useState(false);
  // Local override while a reorder request is in flight (optimistic).
  const [order, setOrder] = useState<QuestionItem[] | null>(null);

  const test = testState.data;
  const questions = order ?? questionsState.data;

  if (testState.error && !test) {
    return (
      <div className="space-y-4">
        <Link href="/panel/testlar" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Testlar
        </Link>
        <ErrorState message={testState.error} onRetry={testState.reload} />
      </div>
    );
  }
  if (!test || !questions) {
    return questionsState.error && test ? (
      <ErrorState message={questionsState.error} onRetry={questionsState.reload} />
    ) : (
      <Loading />
    );
  }

  const reloadAll = () => {
    setOrder(null);
    testState.reload();
    questionsState.reload();
  };

  async function move(index: number, delta: number) {
    if (!questions) return;
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setMoving(true);
    try {
      await apiPost(`/api/v1/tests/${testId}/questions/reorder/`, { order: next.map((q) => q.id) });
      questionsState.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tartibni saqlab bo'lmadi.");
      setOrder(null);
    } finally {
      setMoving(false);
    }
  }

  if (mode.kind === "edit") {
    const number = mode.question ? questions.findIndex((q) => q.id === mode.question!.id) + 1 : questions.length + 1;
    return (
      <QuestionEditor
        key={mode.question?.id ?? `new-${mode.nonce}`}
        me={me}
        test={test}
        question={mode.question}
        number={number}
        onCancel={() => setMode({ kind: "list" })}
        onSaved={(_saved, { addAnother }) => {
          reloadAll();
          setMode(addAnother ? { kind: "edit", question: null, nonce: mode.nonce + 1 } : { kind: "list" });
        }}
      />
    );
  }

  const problemList = questions
    .map((q, i) => ({ q, number: i + 1, problems: problemsOfQuestion(q) }))
    .filter((x) => x.problems.length > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/panel/testlar" className="inline-block text-sm text-muted hover:text-foreground">
          &larr; Testlar
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{test.title}</h1>
              <Badge tone={statusTone(test.status)}>{TEST_STATUS_LABELS[test.status]}</Badge>
            </div>
            <p className="text-sm text-muted">
              {test.subject_name} · {questions.length} ta savol
              {test.time_limit_sec ? ` · ${Math.round((test.time_limit_sec / 60) * 10) / 10} daqiqa` : " · vaqt cheklanmagan"} · o&apos;tish {test.pass_percent}%
            </p>
          </div>
          <TestActions
            me={me}
            test={test}
            onChanged={reloadAll}
            onDeleted={() => router.replace("/panel/testlar")}
            onDuplicated={(copy) => router.push(`/panel/testlar/${copy.id}`)}
          >
            {({ run, duplicate, remove, canDelete, busy }) => (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSettings(true)}>
                  Sozlamalar
                </Button>
                {test.status !== "published" ? (
                  <Button size="sm" disabled={busy} onClick={() => run("publish")}>
                    Nashr qilish
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => run("unpublish")}>
                    Qoralamaga qaytarish
                  </Button>
                )}
                {test.status !== "archived" && (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => run("archive")}>
                    Arxivlash
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={duplicate}>
                  Nusxa olish
                </Button>
                {canDelete && (
                  <Button variant="secondary" size="sm" onClick={remove}>
                    O&apos;chirish
                  </Button>
                )}
              </div>
            )}
          </TestActions>
        </div>
        {test.description_html && <RichHtml html={test.description_html} className="text-sm text-muted" />}
      </div>

      {test.status !== "published" &&
        (questions.length === 0 ? (
          <Notice tone="info">Nashr qilish uchun kamida 1 ta savol qo&apos;shing.</Notice>
        ) : problemList.length > 0 ? (
          <Notice tone="warning">
            <p className="font-medium">Nashr qilishdan oldin {problemList.length} ta savolni to&apos;g&apos;irlash kerak:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {problemList.map(({ q, number, problems }) => (
                <li key={q.id}>
                  <button type="button" className="text-left underline underline-offset-2" onClick={() => setMode({ kind: "edit", question: q, nonce: 0 })}>
                    {number}-savol
                  </button>
                  : {problems.join(" ")}
                </li>
              ))}
            </ul>
          </Notice>
        ) : (
          <Notice tone="success">Barcha savollar to&apos;liq. Testni nashr qilishingiz mumkin.</Notice>
        ))}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Savollar</h2>
        <Button onClick={() => setMode({ kind: "edit", question: null, nonce: 0 })}>Savol qo&apos;shish</Button>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          title="Hozircha savol yo'q"
          hint="Birinchi savolni qo'shing: matn, rasm va variantlar bilan."
          action={<Button onClick={() => setMode({ kind: "edit", question: null, nonce: 0 })}>Savol qo&apos;shish</Button>}
        />
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => {
            const problems = problemsOfQuestion(q);
            return (
              <li key={q.id} className="rounded-2xl border border-border-soft bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-extrabold text-accent">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent">{TYPE_LABEL[q.type]}</Badge>
                      <Badge>{q.points} ball</Badge>
                      <Badge>{q.options.length} ta variant</Badge>
                      {problems.length > 0 && <Badge tone="warning">To&apos;liq emas</Badge>}
                    </div>
                    <div className="max-h-28 overflow-hidden">
                      {q.body_html ? (
                        <RichHtml html={q.body_html} className="text-base" />
                      ) : q.image_url ? (
                        <p className="text-sm text-muted">(rasmli savol)</p>
                      ) : (
                        <p className="text-sm text-muted">(matn kiritilmagan)</p>
                      )}
                    </div>
                    {q.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.image_url} alt="" className="h-16 rounded-md bg-subtle object-contain" />
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col sm:flex-row">
                    <Button variant="ghost" size="icon" disabled={i === 0 || moving} onClick={() => move(i, -1)} aria-label={`${i + 1}-savolni yuqoriga`}>
                      <Arrow dir="up" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={i === questions.length - 1 || moving} onClick={() => move(i, 1)} aria-label={`${i + 1}-savolni pastga`}>
                      <Arrow dir="down" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 pl-11">
                  <Button variant="secondary" size="sm" onClick={() => setMode({ kind: "edit", question: q, nonce: 0 })}>
                    Tahrirlash
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setDeleting(q)}>
                    O&apos;chirish
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {settings && <TestForm me={me} test={test} onClose={() => setSettings(false)} onSaved={reloadAll} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Savolni o'chirasizmi?"
        message="Savol va uning barcha variantlari o'chiriladi. Bu amalni qaytarib bo'lmaydi."
        confirmLabel="O'chirish"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          await apiDelete(`/api/v1/questions/${deleting.id}/`);
          toast.success("Savol o'chirildi.");
          reloadAll();
        }}
      />
    </div>
  );
}

