"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApiError, apiDelete, apiGetAll, apiPost, formErrors } from "@/lib/api";
import type { CurrentUser, PublishProblem, Subject, TestItem, TestStatus } from "@/lib/types";
import { useFetch } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

type Action = "publish" | "unpublish" | "archive";

/** Who may delete: not while published; a teacher only their own tests (decision #13). */
export function canDeleteTest(me: CurrentUser, test: TestItem): boolean {
  if (test.status === "published") return false;
  return me.role !== "teacher" || test.author === me.id;
}

function extractProblems(e: unknown): PublishProblem[] {
  if (!(e instanceof ApiError) || !Array.isArray(e.body.errors)) return [];
  return e.body.errors as PublishProblem[];
}

function DuplicateForm({ test, onClose, onDone }: { test: TestItem; onClose: () => void; onDone: (copy: TestItem) => void }) {
  const toast = useToast();
  const subjects = useFetch("subjects-all", () => apiGetAll<Subject>("/api/v1/subjects/"));
  const sameBranch = (subjects.data ?? []).filter((s) => s.branch.id === test.branch && s.is_active);
  const [subject, setSubject] = useState(test.subject);
  const [title, setTitle] = useState(`${test.title} (nusxa)`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const copy = await apiPost<TestItem>(`/api/v1/tests/${test.id}/duplicate/`, { subject, title: title.trim() });
      toast.success("Test nusxalandi (qoralama sifatida).");
      onDone(copy);
      onClose();
    } catch (e) {
      setError(formErrors(e).general ?? Object.values(formErrors(e).fields).join(" "));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      size="sm"
      onClose={() => !pending && onClose()}
      title="Testdan nusxa olish"
      description="Nusxa qoralama bo'lib yaratiladi."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button onClick={submit} loading={pending} disabled={!title.trim() || !subject}>
            Nusxa olish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice>{error}</Notice>}
        <Field label="Yangi sarlavha">{(p) => <Input {...p} value={title} maxLength={250} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Fan" hint="Faqat shu filialdagi fanlar.">
          {(p) => (
            <Select {...p} value={subject} onChange={(e) => setSubject(e.target.value)}>
              {sameBranch.length === 0 && <option value={test.subject}>{test.subject_name}</option>}
              {sameBranch.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

const CONFIRM: Record<Action, { title: string; message: string; label: string; done: string; danger?: boolean }> = {
  publish: {
    title: "Testni nashr qilasizmi?",
    message: "Nashr qilingach, test o'quvchilarga ko'rinadi. Barcha savollar to'liq bo'lishi shart.",
    label: "Nashr qilish",
    done: "Test nashr qilindi.",
  },
  unpublish: {
    title: "Nashrdan qaytarasizmi?",
    message: "Test qoralamaga qaytadi va o'quvchilarga ko'rinmaydi.",
    label: "Qoralamaga qaytarish",
    done: "Test qoralamaga qaytarildi.",
  },
  archive: {
    title: "Testni arxivlaysizmi?",
    message: "Arxivlangan test o'quvchilarga ko'rinmaydi. Uni keyinroq qayta nashr qilish mumkin.",
    label: "Arxivlash",
    done: "Test arxivlandi.",
  },
};

/**
 * Publish / unpublish / archive / duplicate / delete for one test, with all dialogs.
 * `children` renders the trigger buttons from the returned handlers.
 */
export function TestActions({
  me,
  test,
  onChanged,
  onDeleted,
  onDuplicated,
  children,
}: {
  me: CurrentUser;
  test: TestItem;
  onChanged: (test: TestItem) => void;
  onDeleted: () => void;
  onDuplicated?: (copy: TestItem) => void;
  children: (api: { run: (a: Action) => void; duplicate: () => void; remove: () => void; canDelete: boolean; busy: boolean }) => ReactNode;
}) {
  const toast = useToast();
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [problems, setProblems] = useState<{ message: string; items: PublishProblem[] } | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function execute(action: Action) {
    setBusy(true);
    try {
      const updated = await apiPost<TestItem>(`/api/v1/tests/${test.id}/${action}/`);
      toast.success(CONFIRM[action].done);
      onChanged(updated);
    } catch (e) {
      const items = extractProblems(e);
      if (action === "publish" && items.length > 0) {
        setPendingAction(null);
        setProblems({ message: (e as Error).message, items });
        return;
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }

  function run(action: Action) {
    // Publishing is the moment validation matters: try it directly; archive/unpublish confirm first.
    if (action === "publish") {
      execute("publish").catch((e: Error) => toast.error(e.message));
    } else {
      setPendingAction(action);
    }
  }

  const canDelete = canDeleteTest(me, test);
  const cfg = pendingAction ? CONFIRM[pendingAction] : null;

  return (
    <>
      {children({ run, duplicate: () => setDuplicating(true), remove: () => setDeleting(true), canDelete, busy })}

      <ConfirmDialog
        open={cfg !== null}
        onClose={() => setPendingAction(null)}
        title={cfg?.title ?? ""}
        message={cfg?.message ?? ""}
        confirmLabel={cfg?.label ?? ""}
        onConfirm={() => (pendingAction ? execute(pendingAction) : Promise.resolve())}
      />

      <Dialog
        open={problems !== null}
        onClose={() => setProblems(null)}
        title="Test nashr qilinmadi"
        description="Quyidagi savollarni to'g'irlab, qayta urinib ko'ring."
        footer={
          <>
            <Button variant="secondary" onClick={() => setProblems(null)}>
              Yopish
            </Button>
            <Link
              href={`/panel/testlar/${test.id}`}
              onClick={() => setProblems(null)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground hover:bg-accent-hover"
            >
              Testni ochish
            </Link>
          </>
        }
      >
        <div className="space-y-3">
          {problems && <p className="text-sm text-muted">{problems.message}</p>}
          <ul className="space-y-3">
            {problems?.items.map((item, i) => (
              <li key={item.question_id ?? i} className="rounded-lg border border-danger-line bg-danger-soft p-3 text-sm">
                {item.number !== undefined && <p className="font-medium text-danger">{item.number}-savol</p>}
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-danger">
                  {item.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>

      {duplicating && (
        <DuplicateForm
          test={test}
          onClose={() => setDuplicating(false)}
          onDone={(copy) => onDuplicated?.(copy)}
        />
      )}

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Testni o'chirasizmi?"
        message={`"${test.title}" va uning barcha savollari butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.`}
        confirmLabel="O'chirish"
        danger
        onConfirm={async () => {
          await apiDelete(`/api/v1/tests/${test.id}/`);
          toast.success("Test o'chirildi.");
          onDeleted();
        }}
      />
    </>
  );
}

export function statusTone(status: TestStatus): "neutral" | "success" | "warning" {
  return status === "published" ? "success" : status === "archived" ? "warning" : "neutral";
}
