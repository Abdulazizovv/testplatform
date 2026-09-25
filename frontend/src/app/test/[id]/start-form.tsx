"use client";

import { Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { getAttempt, recallAttempt, rememberAttempt, forgetAttempt, startAttempt } from "@/lib/public-client";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";

const NAME_CHARS = /^[\p{L}][\p{L} '’‘ʻʼ`-]*$/u;

function validate(fullName: string, age: string) {
  const errors: { full_name?: string; age?: string } = {};
  const name = fullName.replace(/\s+/g, " ").trim();
  const letters = [...name].filter((ch) => /\p{L}/u.test(ch)).length;
  if (!name) errors.full_name = "Ismingizni kiriting.";
  else if (name.length > 60 || letters < 2) errors.full_name = "Ism 2 dan 60 gacha belgidan iborat bo'lishi kerak.";
  else if (!NAME_CHARS.test(name)) errors.full_name = "Ismda faqat harflar, bo'sh joy, apostrof va tire bo'lishi mumkin.";
  const n = Number(age);
  if (!age.trim()) errors.age = "Yoshingizni kiriting.";
  else if (!/^\d+$/.test(age.trim()) || n < 4 || n > 100) errors.age = "Yosh 4 dan 100 gacha bo'lgan butun son bo'lishi kerak.";
  return { errors, name, age: n };
}

export function StartForm({ testId, timed }: { testId: string; timed: boolean }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [errors, setErrors] = useState<{ full_name?: string; age?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  // An unfinished attempt of this test on this device: offer to continue instead of starting over.
  useEffect(() => {
    const token = recallAttempt(testId);
    if (!token) return;
    let cancelled = false;
    getAttempt(token)
      .then((state) => {
        if (cancelled) return;
        if (state.status === "in_progress") setResumeToken(token);
        else forgetAttempt(testId);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) forgetAttempt(testId);
      });
    return () => {
      cancelled = true;
    };
  }, [testId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const checked = validate(fullName, age);
    setErrors(checked.errors);
    setGeneral(null);
    if (checked.errors.full_name || checked.errors.age) return;
    setPending(true);
    try {
      const attempt = await startAttempt(testId, checked.name, checked.age);
      rememberAttempt(testId, attempt.access_token);
      router.push(`/yechish/${attempt.access_token}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields;
        setErrors({ full_name: fields.full_name, age: fields.age });
        const errs = err.body.errors as Array<{ access_token?: string }> | undefined;
        if (err.status === 409 && errs?.[0]?.access_token) {
          rememberAttempt(testId, errs[0].access_token);
          setResumeToken(errs[0].access_token);
        }
        if (!fields.full_name && !fields.age) setGeneral(err.message);
      } else {
        setGeneral("Xatolik yuz berdi. Qayta urinib ko'ring.");
      }
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {resumeToken && (
        <Notice tone="info" className="flex flex-col gap-3">
          <span>Bu testni boshlagansiz, lekin yakunlamagansiz. Davom ettirishingiz mumkin.</span>
          <Link href={`/yechish/${resumeToken}`} className={buttonClass("primary", "md", "w-full sm:w-auto")}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Davom ettirish
          </Link>
        </Notice>
      )}
      {!open ? (
        <Button onClick={() => setOpen(true)} size="lg" className="w-full" variant={resumeToken ? "secondary" : "primary"}>
          <Play className="size-5 fill-current" aria-hidden="true" />
          Boshlash
        </Button>
      ) : (
        <form onSubmit={submit} noValidate className="anim-rise space-y-5 rounded-3xl border-2 border-border-soft bg-surface p-5 shadow-md md:p-6">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold tracking-tight">Keling, tanishaylik</h2>
            <p className="text-sm text-muted">Testni boshlashdan oldin ismingiz va yoshingizni kiriting.</p>
          </div>
          <Field label="Ism va familiya" error={errors.full_name}>
            {(p) => (
              <Input
                {...p}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                autoFocus
                maxLength={80}
                placeholder="Masalan, Ali Valiyev"
                className="min-h-14 text-lg"
              />
            )}
          </Field>
          <Field label="Yosh" error={errors.age} hint="4 dan 100 gacha">
            {(p) => (
              <Input
                {...p}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                className="min-h-14 max-w-36 text-lg"
              />
            )}
          </Field>
          {timed && (
            <Notice tone="warning">
              &quot;Testni boshlash&quot; bosilishi bilan vaqt hisoblanadi va uni to&apos;xtatib bo&apos;lmaydi.
            </Notice>
          )}
          {general && <Notice>{general}</Notice>}
          <Button type="submit" size="lg" loading={pending} className="w-full">
            Testni boshlash
          </Button>
        </form>
      )}
    </div>
  );
}
