"use client";

import { AlertCircle, Check, ChevronLeft, ChevronRight, Clock, CloudOff, Eraser, Flag, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OptionCard } from "@/components/public/option-card";
import { RichHtml } from "@/components/rich-html";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Notice, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { finishAttempt, forgetAttempt, getAttempt, isTransient, saveAnswer } from "@/lib/public-client";
import type { AttemptItem, AttemptState } from "@/lib/public-types";

type SaveState = "saving" | "saved" | "error";

export function Solver({ token }: { token: string }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const answersRef = useRef<Record<string, string[]>>({});
  const inflight = useRef(new Set<string>());
  const dirty = useRef(new Set<string>());
  const retryIds = useRef(new Set<string>());
  const deadline = useRef<number | null>(null); // performance.now() based: immune to client clock changes
  const closing = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const movedRef = useRef(false);

  const syncTimer = useCallback((sec: number | null) => {
    deadline.current = sec === null ? null : performance.now() + sec * 1000;
    setRemaining(sec);
  }, []);

  const goResult = useCallback(() => {
    closing.current = true;
    router.replace(`/natija/${token}`);
  }, [router, token]);

  // --- initial load ------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    getAttempt(token)
      .then((state) => {
        if (cancelled) return;
        if (state.status !== "in_progress" || !state.items) {
          forgetAttempt(state.test.id);
          goResult();
          return;
        }
        const initial: Record<string, string[]> = {};
        for (const item of state.items) initial[item.id] = item.selected_option_ids;
        answersRef.current = initial;
        setAnswers(initial);
        const firstOpen = state.items.findIndex((i) => !i.answered);
        setIndex(firstOpen === -1 ? 0 : firstOpen);
        syncTimer(state.remaining_sec);
        setAttempt(state);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof ApiError ? e : new ApiError(0, "Xatolik yuz berdi."));
      });
    return () => {
      cancelled = true;
    };
  }, [token, goResult, syncTimer]);

  // --- autosave ----------------------------------------------------------------------------
  const persist = useCallback(
    async (itemId: string) => {
      if (inflight.current.has(itemId)) {
        dirty.current.add(itemId); // latest choice is sent when the current request ends
        return;
      }
      inflight.current.add(itemId);
      retryIds.current.delete(itemId);
      setSaveState((s) => ({ ...s, [itemId]: "saving" }));
      try {
        do {
          dirty.current.delete(itemId);
          const res = await saveAnswer(token, itemId, answersRef.current[itemId] ?? []);
          syncTimer(res.remaining_sec);
        } while (dirty.current.has(itemId));
        setSaveState((s) => ({ ...s, [itemId]: "saved" }));
      } catch (e) {
        if (e instanceof ApiError && (e.status === 410 || e.status === 409)) {
          goResult(); // the server already closed the attempt
          return;
        }
        if (isTransient(e)) retryIds.current.add(itemId);
        setSaveState((s) => ({ ...s, [itemId]: "error" }));
      } finally {
        inflight.current.delete(itemId);
      }
    },
    [token, syncTimer, goResult],
  );

  // Retry failed saves in the background until they go through.
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const itemId of [...retryIds.current]) void persist(itemId);
    }, 4000);
    return () => window.clearInterval(id);
  }, [persist]);

  /** Wait for in-flight saves; give failed ones one more try. Never blocks longer than ~6 s. */
  const flush = useCallback(async () => {
    for (const itemId of Object.keys(answersRef.current)) {
      if (retryIds.current.has(itemId)) void persist(itemId);
    }
    const until = Date.now() + 6000;
    while (inflight.current.size > 0 && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }, [persist]);

  // --- finishing ---------------------------------------------------------------------------
  const finish = useCallback(async () => {
    closing.current = true;
    await flush();
    try {
      await finishAttempt(token);
    } catch (e) {
      closing.current = false;
      throw e;
    }
    if (attempt) forgetAttempt(attempt.test.id);
    router.replace(`/natija/${token}`);
  }, [flush, token, router, attempt]);

  const autoFinish = useCallback(async () => {
    setTimeUp(true);
    setFinishError(null);
    for (let tryNo = 0; tryNo < 4; tryNo++) {
      try {
        await finish();
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    setFinishError("Natijani yuborib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.");
  }, [finish]);

  // --- countdown (server-derived) ------------------------------------------------------------
  const timedOut = useRef(false);
  useEffect(() => {
    if (!attempt || deadline.current === null) return;
    const tick = () => {
      if (deadline.current === null) return;
      const left = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !timedOut.current) {
        timedOut.current = true;
        void autoFinish();
      }
    };
    const id = window.setInterval(tick, 500);
    tick();
    return () => window.clearInterval(id);
  }, [attempt, autoFinish]);

  // A backgrounded phone may pause timers: re-read the server clock when the tab is back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !attempt) return;
      getAttempt(token)
        .then((state) => {
          if (state.status !== "in_progress") goResult();
          else syncTimer(state.remaining_sec);
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [attempt, token, syncTimer, goResult]);

  // Warn before accidentally closing/refreshing (progress is kept on the server anyway).
  useEffect(() => {
    if (!attempt) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (closing.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [attempt]);

  // Keyboard/screen-reader users land on the new question when they move.
  useEffect(() => {
    if (movedRef.current) headingRef.current?.focus();
  }, [index]);

  const items = attempt?.items;
  const answeredCount = useMemo(
    () => (items ? items.filter((i) => (answers[i.id] ?? []).length > 0).length : 0),
    [items, answers],
  );

  if (loadError) {
    return (
      <Frame>
        <div role="alert" className="space-y-4 rounded-3xl border-2 border-border-soft bg-surface p-6 text-center shadow-md">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <AlertCircle className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-extrabold">{loadError.status === 404 ? "Test topilmadi" : "Testni yuklab bo'lmadi"}</h1>
          <p className="text-muted">
            {loadError.status === 404
              ? "Havola noto'g'ri yoki eskirgan bo'lishi mumkin."
              : loadError.message}
          </p>
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            {loadError.status !== 404 && (
              <Button onClick={() => window.location.reload()} variant="secondary">
                Qayta urinish
              </Button>
            )}
            <Link href="/" className={buttonClass("primary")}>
              Bosh sahifa
            </Link>
          </div>
        </div>
      </Frame>
    );
  }
  if (!attempt || !items) {
    return (
      <Frame>
        <div role="status" aria-label="Test yuklanmoqda" className="space-y-4 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full rounded-3xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <span className="sr-only">Test yuklanmoqda...</span>
        </div>
      </Frame>
    );
  }

  const item = items[index];
  const chosen = answers[item.id] ?? [];
  const status = saveState[item.id];
  const isLast = index === items.length - 1;
  const total = items.length;
  const softLow = remaining !== null && remaining <= 300;
  const lowTime = remaining !== null && remaining <= 60;
  const unanswered = total - answeredCount;
  const hasImages = item.options.some((o) => o.image_url);

  function go(next: number) {
    movedRef.current = true;
    setIndex(Math.min(Math.max(next, 0), total - 1));
    window.scrollTo({ top: 0 });
  }

  function select(it: AttemptItem, optionId: string, checked: boolean) {
    const current = answersRef.current[it.id] ?? [];
    const next =
      it.type === "single" ? (checked ? [optionId] : []) : checked ? [...current, optionId] : current.filter((id) => id !== optionId);
    answersRef.current = { ...answersRef.current, [it.id]: next };
    setAnswers(answersRef.current);
    void persist(it.id);
  }

  return (
    <Frame wide>
      <header className="sticky top-0 z-10 border-b border-border-soft bg-background/90 px-4 pb-3 pt-2 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 lg:max-w-5xl">
          <p className="min-w-0 truncate text-sm font-bold text-muted" title={attempt.test.title}>
            {attempt.test.title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <SaveIndicator status={status} />
            {remaining !== null && (
              <span
                role="timer"
                aria-label="Qolgan vaqt"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-base font-extrabold tabular-nums transition-colors duration-500",
                  lowTime ? "bg-danger-soft text-danger" : softLow ? "bg-warning-soft text-warning" : "bg-subtle text-foreground",
                )}
              >
                <Clock className="size-4" aria-hidden="true" />
                {formatClock(remaining)}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)} disabled={timeUp} className="max-sm:hidden">
              Yakunlash
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl items-center gap-3 lg:max-w-5xl">
          <p className="shrink-0 text-sm font-extrabold tabular-nums">
            {index + 1} / {total}
          </p>
          <div
            role="progressbar"
            aria-label="Javob berilgan savollar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={answeredCount}
            aria-valuetext={`${total} ta savoldan ${answeredCount} tasiga javob berildi`}
            className="h-3 flex-1 overflow-hidden rounded-full bg-border-soft"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${(answeredCount / total) * 100}%` }} />
          </div>
          <p className="shrink-0 text-xs font-bold text-muted">{answeredCount} ta javob</p>
        </div>
      </header>

      <div className="mx-auto mt-5 grid max-w-3xl gap-6 px-4 lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section aria-labelledby="q-heading" className="min-w-0 space-y-4">
          {timeUp && (
            <Notice tone="warning">
              <span className="flex items-center gap-2">
                <Spinner />
                Vaqt tugadi. Natijangiz hisoblanmoqda...
              </span>
            </Notice>
          )}
          {finishError && (
            <Notice>
              <span className="block">{finishError}</span>
              <Button variant="secondary" size="sm" onClick={() => void autoFinish()} className="mt-2">
                Qayta urinish
              </Button>
            </Notice>
          )}
          <div key={item.id} className="anim-rise space-y-5 rounded-3xl border-2 border-border-soft bg-surface p-5 shadow-md md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <h1 id="q-heading" ref={headingRef} tabIndex={-1} className="rounded-full bg-accent-soft px-3 py-1 text-sm font-extrabold text-accent outline-none">
                {index + 1}-savol
              </h1>
              <span className="rounded-full bg-subtle px-3 py-1 text-xs font-bold text-muted">
                {item.type === "multiple" ? "Bir nechta javob tanlang" : "Bitta javob tanlang"}
              </span>
            </div>
            <RichHtml html={item.body_html} className="text-xl font-semibold leading-snug md:text-2xl" />
            {item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="max-h-96 w-auto max-w-full rounded-2xl" />
            )}
            <fieldset disabled={timeUp} className={cn("min-w-0", hasImages ? "grid gap-3 sm:grid-cols-2" : "space-y-3")}>
              <legend className="sr-only">
                {item.type === "multiple" ? "Bir nechta javob tanlang" : "Bitta javob tanlang"}
              </legend>
              {item.options.map((option, i) => (
                <OptionCard
                  key={option.id}
                  itemId={item.id}
                  option={option}
                  letter={String.fromCharCode(65 + (i % 26))}
                  type={item.type}
                  checked={chosen.includes(option.id)}
                  onChange={(checked) => select(item, option.id, checked)}
                />
              ))}
            </fieldset>
            {item.type === "single" && chosen.length > 0 && (
              <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-bold text-muted hover:text-foreground" onClick={() => select(item, chosen[0], false)}>
                <Eraser className="size-4" aria-hidden="true" />
                Tanlovni bekor qilish
              </button>
            )}
            {status === "error" && (
              <Notice className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>Javobingiz saqlanmadi. Internetni tekshiring, u avtomatik qayta yuboriladi.</span>
                <Button variant="secondary" size="sm" onClick={() => void persist(item.id)}>
                  Hozir qayta urinish
                </Button>
              </Notice>
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border-soft bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-2 lg:max-w-none">
              <Button variant="secondary" size="lg" onClick={() => go(index - 1)} disabled={index === 0 || timeUp} aria-label="Oldingi savol" className="flex-1 lg:flex-none lg:px-6">
                <ChevronLeft className="size-5" aria-hidden="true" />
                Oldingi
              </Button>
              <Button variant="soft" size="lg" onClick={() => setPaletteOpen(true)} aria-label="Savollar ro'yxatini ochish" className="px-4 lg:hidden">
                <LayoutGrid className="size-5" aria-hidden="true" />
                <span className="tabular-nums">
                  {answeredCount}/{total}
                </span>
              </Button>
              {isLast ? (
                <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={timeUp} className="flex-1 lg:ml-auto lg:flex-none lg:px-6">
                  <Flag className="size-5 max-sm:hidden" aria-hidden="true" />
                  Yakunlash
                </Button>
              ) : (
                <Button size="lg" onClick={() => go(index + 1)} disabled={timeUp} className="flex-1 lg:ml-auto lg:flex-none lg:px-6">
                  Keyingi
                  <ChevronRight className="size-5" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </section>

        <aside className="hidden lg:block">
          <nav aria-label="Savollar" className="sticky top-32 space-y-3 rounded-3xl border-2 border-border-soft bg-surface p-4 shadow-sm">
            <p className="text-sm font-extrabold">
              Savollar ({answeredCount}/{total})
            </p>
            <Palette items={items} answers={answers} index={index} onPick={go} />
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)} disabled={timeUp} className="w-full">
              <Flag className="size-4" aria-hidden="true" />
              Yakunlash
            </Button>
          </nav>
        </aside>
      </div>

      <Dialog open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Savollar" description={`${total} ta savoldan ${answeredCount} tasiga javob berildi`} size="sm">
        <nav aria-label="Savollar" className="space-y-4">
          <Palette
            items={items}
            answers={answers}
            index={index}
            onPick={(i) => {
              setPaletteOpen(false);
              go(i);
            }}
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setPaletteOpen(false);
              setConfirmOpen(true);
            }}
            disabled={timeUp}
          >
            <Flag className="size-4" aria-hidden="true" />
            Testni yakunlash
          </Button>
        </nav>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Testni yakunlaysizmi?"
        message={
          unanswered > 0
            ? `${unanswered} ta savolga javob berilmagan. Yakunlagach javoblarni o'zgartirib bo'lmaydi. Baribir yakunlaysizmi?`
            : "Yakunlagach javoblarni o'zgartirib bo'lmaydi."
        }
        confirmLabel="Yakunlash"
        onConfirm={finish}
      />
    </Frame>
  );
}

function Palette({ items, answers, index, onPick }: { items: AttemptItem[]; answers: Record<string, string[]>; index: number; onPick: (i: number) => void }) {
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2">
      {items.map((it, i) => {
        const done = (answers[it.id] ?? []).length > 0;
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-label={`${i + 1}-savol${done ? ", javob berilgan" : ", javobsiz"}`}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "size-11 w-full rounded-xl border-2 text-sm font-extrabold tabular-nums transition-[transform,background-color,border-color] active:scale-95",
                i === index
                  ? "border-accent bg-accent text-accent-foreground shadow-md"
                  : done
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-border bg-surface text-foreground hover:bg-subtle",
              )}
            >
              {i + 1}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SaveIndicator({ status }: { status: SaveState | undefined }) {
  return (
    <span className="inline-flex min-h-6 items-center gap-1 text-xs font-bold" aria-live="polite">
      {status === "saving" && (
        <span className="inline-flex items-center gap-1 text-muted">
          <Spinner className="size-3.5" />
          <span className="hidden sm:inline">Saqlanmoqda</span>
        </span>
      )}
      {status === "saved" && (
        <span className="inline-flex items-center gap-1 text-success">
          <Check className="size-4" strokeWidth={3} aria-hidden="true" />
          Saqlandi
        </span>
      )}
      {status === "error" && (
        <span className="inline-flex items-center gap-1 text-danger">
          <CloudOff className="size-4" aria-hidden="true" />
          Saqlanmadi
        </span>
      )}
    </span>
  );
}

function Frame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="bg-playful min-h-dvh">
      <main className={cn("mx-auto w-full pb-32 pt-0 lg:pb-16", wide ? "max-w-none" : "max-w-xl px-4 pt-10")}>{children}</main>
    </div>
  );
}
