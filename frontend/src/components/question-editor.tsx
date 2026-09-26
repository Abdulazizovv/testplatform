"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, apiPatch, apiPost, uploadImage } from "@/lib/api";
import { useUnsavedGuard } from "@/lib/hooks";
import { mapQuestionError, questionProblems, type QuestionErrors } from "@/lib/question-rules";
import type { BodyFormat, CurrentUser, MediaAsset, QuestionItem, QuestionType, TestItem } from "@/lib/types";
import { ImageField, type MediaRef } from "@/components/image-field";
import { RichField } from "@/components/rich-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

interface OptionDraft {
  key: string;
  id?: string;
  text: string;
  image: MediaRef | null;
  is_correct: boolean;
}

interface Draft {
  type: QuestionType;
  format: BodyFormat;
  body: string;
  image: MediaRef | null;
  explanation: string;
  points: string;
  options: OptionDraft[];
}

let keyCounter = 0;
const newKey = () => `opt-${++keyCounter}`;

function blankOption(): OptionDraft {
  return { key: newKey(), text: "", image: null, is_correct: false };
}

function toDraft(q: QuestionItem | null): Draft {
  if (!q) {
    return { type: "single", format: "md", body: "", image: null, explanation: "", points: "1", options: [blankOption(), blankOption()] };
  }
  return {
    type: q.type === "multiple" ? "multiple" : "single",
    format: q.body_format,
    body: q.body_src,
    image: q.image && q.image_url ? { id: q.image, url: q.image_url } : null,
    explanation: q.explanation,
    points: String(q.points),
    options: q.options.map((o) => ({
      key: newKey(),
      id: o.id,
      text: o.text_src,
      image: o.image && o.image_url ? { id: o.image, url: o.image_url } : null,
      is_correct: o.is_correct,
    })),
  };
}

/** Comparable snapshot (ignores React keys) for the unsaved-changes check. */
function snapshot(d: Draft): string {
  return JSON.stringify({
    ...d,
    options: d.options.map((o) => ({ id: o.id, text: o.text, image: o.image, is_correct: o.is_correct })),
  });
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean; note?: string }>;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent md:min-h-10",
              value === o.value ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-foreground",
              o.disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
            {o.note && <Badge>{o.note}</Badge>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ArrowButton({ dir, disabled, onClick, label }: { dir: "up" | "down"; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon" disabled={disabled} onClick={onClick} aria-label={label}>
      {dir === "up" ? <ChevronUp className="size-5" aria-hidden="true" /> : <ChevronDown className="size-5" aria-hidden="true" />}
    </Button>
  );
}

export function QuestionEditor({
  me,
  test,
  question,
  number,
  onCancel,
  onSaved,
}: {
  me: CurrentUser;
  test: TestItem;
  question: QuestionItem | null;
  /** 1-based position shown in the title (new questions go last). */
  number: number;
  onCancel: () => void;
  onSaved: (question: QuestionItem, options: { addAnother: boolean }) => void;
}) {
  const toast = useToast();
  const [first] = useState<Draft>(() => toDraft(question));
  const [draft, setDraft] = useState<Draft>(first);
  const [baseline, setBaseline] = useState(() => snapshot(first));
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<QuestionErrors | null>(null);
  const addAnotherRef = useRef(false);

  const dirty = snapshot(draft) !== baseline;
  useUnsavedGuard(dirty);

  const upload = useCallback(
    (file: File): Promise<MediaAsset> => uploadImage(file, me.role === "superadmin" ? test.branch : undefined),
    [me.role, test.branch],
  );

  const patch = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const patchOption = (key: string, changes: Partial<OptionDraft>) =>
    setDraft((d) => ({ ...d, options: d.options.map((o) => (o.key === key ? { ...o, ...changes } : o)) }));

  function setType(type: QuestionType) {
    setDraft((d) => {
      if (type === "single") {
        // A single-answer question has exactly one correct option: keep only the first.
        const firstCorrect = d.options.findIndex((o) => o.is_correct);
        return { ...d, type, options: d.options.map((o, i) => (o.is_correct && i !== firstCorrect ? { ...o, is_correct: false } : o)) };
      }
      return { ...d, type };
    });
  }

  function markCorrect(key: string, checked: boolean) {
    setDraft((d) => ({
      ...d,
      options: d.options.map((o) => {
        if (d.type === "single") return { ...o, is_correct: o.key === key };
        return o.key === key ? { ...o, is_correct: checked } : o;
      }),
    }));
  }

  function moveOption(index: number, delta: number) {
    setDraft((d) => {
      const next = [...d.options];
      const target = index + delta;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, options: next };
    });
  }

  const problems = useMemo(
    () =>
      questionProblems({
        type: draft.type,
        bodySrc: draft.body,
        hasImage: draft.image !== null,
        options: draft.options.map((o) => ({ text: o.text, hasImage: o.image !== null, isCorrect: o.is_correct })),
      }),
    [draft],
  );

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const points = Number(draft.points);
    if (!Number.isInteger(points) || points < 1) {
      setErrors({ general: null, points: "Ball 1 yoki undan katta butun son bo'lishi kerak.", options: [], problems: [] });
      return;
    }
    setPending(true);
    setErrors(null);
    const payload = {
      type: draft.type,
      body_format: draft.format,
      body_src: draft.body,
      image: draft.image?.id ?? null,
      explanation: draft.explanation,
      points,
      // The full ordered list: options with an id are updated, without are created, omitted ones are deleted.
      options: draft.options.map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        text_src: o.text,
        image: o.image?.id ?? null,
        is_correct: o.is_correct,
      })),
    };
    try {
      const saved = question
        ? await apiPatch<QuestionItem>(`/api/v1/questions/${question.id}/`, payload)
        : await apiPost<QuestionItem>(`/api/v1/tests/${test.id}/questions/`, payload);
      toast.success("Savol saqlandi.");
      setBaseline(snapshot(draft));
      onSaved(saved, { addAnother: addAnotherRef.current });
    } catch (err) {
      if (err instanceof ApiError) setErrors(mapQuestionError(err));
      else setErrors({ general: "Saqlashda xatolik yuz berdi.", options: [], problems: [] });
      setPending(false);
    }
  }

  function cancel() {
    if (dirty && !window.confirm("Saqlanmagan o'zgarishlar bor. Baribir chiqasizmi?")) return;
    onCancel();
  }

  const strict = test.status === "published";
  const multiple = draft.type === "multiple";

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">{question ? `${number}-savolni tahrirlash` : "Yangi savol"}</h2>
          {dirty && <p className="text-sm text-warning">Saqlanmagan o&apos;zgarishlar bor.</p>}
        </div>
        <Button variant="ghost" onClick={cancel} disabled={pending}>
          &larr; Savollar ro&apos;yxatiga
        </Button>
      </div>

      {errors?.general && <Notice>{errors.general}</Notice>}
      {errors && errors.problems.length > 0 && (
        <Notice>
          <p className="font-medium">Savol to&apos;liq emas:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented<QuestionType>
          label="Savol turi"
          value={draft.type}
          onChange={setType}
          options={[
            { value: "single", label: "Bitta javob" },
            { value: "multiple", label: "Ko'p javob" },
          ]}
        />
        <Segmented<BodyFormat>
          label="Matn formati"
          value={draft.format}
          onChange={(format) => patch({ format })}
          options={[
            { value: "md", label: "Markdown" },
            { value: "html", label: "HTML" },
          ]}
        />
      </div>
      <p className="-mt-3 text-sm text-muted">
        Yoziladigan (ochiq) javobli savollar <Badge>tez orada</Badge> qo&apos;shiladi.
        {draft.format === "html" && " HTML rejimida xavfsiz teglar (p, b, i, ul, table, img va h.k.) ishlaydi; qolganlari olib tashlanadi."}
      </p>

      {errors?.type && <Notice>{errors.type}</Notice>}

      <RichField
        label="Savol matni"
        format={draft.format}
        value={draft.body}
        onChange={(body) => patch({ body })}
        upload={upload}
        error={errors?.body}
        rows={6}
        placeholder={draft.format === "md" ? "Masalan: 2 + 2 nechaga teng?" : "<p>2 + 2 nechaga teng?</p>"}
        hint="Formula: $x^2$ yoki blok uchun $$...$$. Rasmni matn ichiga qo'yish uchun uni shu yerga tashlang yoki joylashtiring."
      />

      <ImageField label="Savol rasmi (ixtiyoriy)" value={draft.image} onChange={(image) => patch({ image })} upload={upload} error={errors?.image} />

      <section className="space-y-3" aria-labelledby="options-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="options-title" className="text-base font-semibold">
              Variantlar
            </h3>
            <p className="text-sm text-muted">
              {multiple ? "To'g'ri javoblarni belgilang (bir nechta bo'lishi mumkin)." : "Bitta to'g'ri javobni tanlang."}
            </p>
          </div>
          <Badge>{draft.options.length} ta</Badge>
        </div>

        {errors?.optionsGeneral && <Notice>{errors.optionsGeneral}</Notice>}
        {draft.options.length < 2 && (
          <Notice tone={strict ? "danger" : "warning"}>Kamida 2 ta variant bo&apos;lishi kerak.</Notice>
        )}

        <ol className="space-y-3">
          {draft.options.map((o, i) => {
            const oe = errors?.options[i];
            const empty = !o.text.trim() && !o.image;
            return (
              <li key={o.key} className={cn("rounded-xl border bg-surface p-3 sm:p-4", oe?.text || oe?.general ? "border-danger" : "border-border-soft")}>
                <div className="flex items-start gap-3">
                  <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 pt-0.5">
                    <input
                      type={multiple ? "checkbox" : "radio"}
                      name="correct-option"
                      checked={o.is_correct}
                      onChange={(e) => markCorrect(o.key, e.target.checked)}
                      className="size-5 accent-[var(--success)]"
                      aria-label={`${i + 1}-variant to'g'ri javob`}
                    />
                    <span className="text-sm font-semibold text-muted">{i + 1}.</span>
                  </label>
                  <div className="min-w-0 flex-1 space-y-3">
                    <RichField
                      label={`${i + 1}-variant matni`}
                      format={draft.format}
                      value={o.text}
                      onChange={(text) => patchOption(o.key, { text })}
                      upload={upload}
                      error={oe?.text}
                      rows={2}
                      compact
                      images={false}
                    />
                    <ImageField
                      compact
                      label={`${i + 1}-variant rasmi (ixtiyoriy)`}
                      value={o.image}
                      onChange={(image) => patchOption(o.key, { image })}
                      upload={upload}
                      error={oe?.image}
                    />
                    {empty && <p className="text-sm text-warning">Variant bo&apos;sh: matn yoki rasm kiriting.</p>}
                    {oe?.general && <p role="alert" className="text-sm text-danger">{oe.general}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col">
                    <ArrowButton dir="up" label={`${i + 1}-variantni yuqoriga`} disabled={i === 0} onClick={() => moveOption(i, -1)} />
                    <ArrowButton dir="down" label={`${i + 1}-variantni pastga`} disabled={i === draft.options.length - 1} onClick={() => moveOption(i, 1)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${i + 1}-variantni o'chirish`}
                      onClick={() => setDraft((d) => ({ ...d, options: d.options.filter((x) => x.key !== o.key) }))}
                      className="text-danger"
                    >
                      <Trash2 className="size-5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <Button variant="secondary" onClick={() => setDraft((d) => ({ ...d, options: [...d.options, blankOption()] }))}>
          + Variant qo&apos;shish
        </Button>

      </section>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Ball" error={errors?.points}>
          {(p) => <Input {...p} type="number" inputMode="numeric" min="1" step="1" value={draft.points} onChange={(e) => patch({ points: e.target.value })} />}
        </Field>
      </div>

      <RichField
        label="Izoh (ixtiyoriy)"
        format={draft.format}
        value={draft.explanation}
        onChange={(explanation) => patch({ explanation })}
        upload={upload}
        error={errors?.explanation}
        rows={3}
        hint="To'g'ri javob nima uchun to'g'riligini tushuntiring. Natija ko'rsatilganda chiqadi."
      />

      {problems.length > 0 && (
        <Notice tone={strict ? "danger" : "warning"}>
          <p className="font-medium">{strict ? "E'lon qilingan testda savol to'liq bo'lishi shart:" : "Nashr qilishdan oldin to'g'irlang (qoralama sifatida saqlash mumkin):"}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border-soft bg-surface/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end md:-mx-6 md:px-6">
        <Button variant="secondary" onClick={cancel} disabled={pending}>
          Bekor qilish
        </Button>
        {!question && (
          <Button
            variant="secondary"
            type="submit"
            disabled={pending}
            onClick={() => {
              addAnotherRef.current = true;
            }}
          >
            Saqlash va yana qo&apos;shish
          </Button>
        )}
        <Button
          type="submit"
          loading={pending}
          onClick={() => {
            addAnotherRef.current = false;
          }}
        >
          Saqlash
        </Button>
      </div>
    </form>
  );
}
