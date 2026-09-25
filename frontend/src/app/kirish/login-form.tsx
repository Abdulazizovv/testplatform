"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { login } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
      router.replace("/panel");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kirishda xatolik yuz berdi.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Login">
        {(p) => (
          <Input
            {...p}
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="min-h-13"
          />
        )}
      </Field>
      <Field label="Parol">
        {(p) => (
          <div className="relative">
            <Input
              {...p}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="min-h-13 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
            </button>
          </div>
        )}
      </Field>
      {error && <Notice>{error}</Notice>}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Kirilmoqda..." : "Kirish"}
      </Button>
    </form>
  );
}
