"use client";

import { useState, type FormEvent } from "react";
import { apiGetAll, apiPatch, apiPost, formErrors } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { RESULT_VISIBILITY_LABELS, type CurrentUser, type ResultVisibility, type Subject, type TestItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

type Errors = { fields: Record<string, string>; general: string | null };
const NO_ERRORS: Errors = { fields: {}, general: null };

function toNumberOrNull(value: string): number | null {
  const n = Number(value.replace(",", "."));
  return value.trim() === "" || Number.isNaN(n) ? null : n;
}

/** Create (test === null) or edit the test settings. Calls onSaved with the saved test. */
export function TestForm({
  me,
  test,
  defaultSubject,
  onClose,
  onSaved,
}: {
  me: CurrentUser;
  test: TestItem | null;
  defaultSubject?: string;
  onClose: () => void;
  onSaved: (test: TestItem) => void;
}) {
  const toast = useToast();
  const subjects = useFetch("subjects-all", () => apiGetAll<Subject>("/api/v1/subjects/"));
  const [subject, setSubject] = useState(test?.subject ?? defaultSubject ?? "");
  const [title, setTitle] = useState(test?.title ?? "");
  const [description, setDescription] = useState(test?.description_src ?? "");
  const [minutes, setMinutes] = useState(test?.time_limit_sec ? String(Math.round((test.time_limit_sec / 60) * 100) / 100) : "");
  const [passPercent, setPassPercent] = useState(String(test?.pass_percent ?? 60));
  const [maxAttempts, setMaxAttempts] = useState(test?.max_attempts ? String(test.max_attempts) : "");
  const [shuffleQuestions, setShuffleQuestions] = useState(test?.shuffle_questions ?? false);
  const [shuffleOptions, setShuffleOptions] = useState(test?.shuffle_options ?? false);
  const [visibility, setVisibility] = useState<ResultVisibility>(test?.result_visibility ?? "score");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);

  const activeSubjects = (subjects.data ?? []).filter((s) => s.is_active || s.id === test?.subject);
  const showBranch = me.role === "superadmin";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors(NO_ERRORS);
    const minutesValue = toNumberOrNull(minutes);
    const body = {
      subject,
      title: title.trim(),
      description_src: description,
      time_limit_sec: minutesValue === null ? null : Math.round(minutesValue * 60),
      pass_percent: toNumberOrNull(passPercent),
      max_attempts: toNumberOrNull(maxAttempts),
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions,
      result_visibility: visibility,
    };
    try {
      const saved = test ? await apiPatch<TestItem>(`/api/v1/tests/${test.id}/`, body) : await apiPost<TestItem>("/api/v1/tests/", body);
      toast.success(test ? "Test sozlamalari saqlandi." : "Test yaratildi.");
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors(formErrors(err));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      size="lg"
      onClose={() => !pending && onClose()}
      title={test ? "Test sozlamalari" : "Yangi test"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="test-form" loading={pending}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="test-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.general && <Notice>{errors.general}</Notice>}
        <Field label="Sarlavha" error={errors.fields.title}>
          {(p) => <Input {...p} value={title} maxLength={250} required autoFocus onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Fan" error={errors.fields.subject}>
          {(p) => (
            <Select {...p} value={subject} required onChange={(e) => setSubject(e.target.value)}>
              <option value="">{subjects.loading && !subjects.data ? "Yuklanmoqda..." : "Fanni tanlang"}</option>
              {activeSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {showBranch ? `${s.name} (${s.branch.name})` : s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {subjects.data && activeSubjects.length === 0 && (
          <Notice tone="warning">Test yaratish uchun avval fan kerak. Fan yo&apos;q yoki sizga biriktirilmagan.</Notice>
        )}
        <Field label="Tavsif (Markdown)" hint="Ixtiyoriy. O'quvchi testni boshlashdan oldin ko'radi." error={errors.fields.description_src}>
          {(p) => <Textarea {...p} value={description} rows={3} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Vaqt chegarasi (daqiqa)" hint="Bo'sh = cheksiz" error={errors.fields.time_limit_sec}>
            {(p) => <Input {...p} type="number" inputMode="decimal" min="0.02" step="any" value={minutes} onChange={(e) => setMinutes(e.target.value)} />}
          </Field>
          <Field label="O'tish foizi" hint="0 dan 100 gacha" error={errors.fields.pass_percent}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min="0" max="100" step="1" value={passPercent} onChange={(e) => setPassPercent(e.target.value)} />}
          </Field>
          <Field label="Urinishlar soni" hint="Bo'sh = cheksiz" error={errors.fields.max_attempts}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min="1" step="1" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />}
          </Field>
        </div>
        <Field label="Natija ko'rinishi" error={errors.fields.result_visibility}>
          {(p) => (
            <Select {...p} value={visibility} onChange={(e) => setVisibility(e.target.value as ResultVisibility)}>
              {(Object.keys(RESULT_VISIBILITY_LABELS) as ResultVisibility[]).map((v) => (
                <option key={v} value={v}>
                  {RESULT_VISIBILITY_LABELS[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid sm:grid-cols-2">
          <Checkbox label="Savollarni aralashtirish" checked={shuffleQuestions} onChange={(e) => setShuffleQuestions(e.target.checked)} />
          <Checkbox label="Variantlarni aralashtirish" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} />
        </div>
      </form>
    </Dialog>
  );
}
