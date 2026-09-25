import { ArrowLeft, ClipboardCheck, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Kirish" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/panel");

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-accent p-10 text-accent-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-accent-foreground/10" />
        <div className="absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-accent-foreground/10" />
        <div className="relative flex items-center gap-2.5 text-xl font-black tracking-tight">
          <ClipboardCheck className="size-7" />
          Bilim sinovi
        </div>
        <div className="relative max-w-md space-y-4">
          <h2 className="text-4xl font-black leading-tight tracking-tight">Testlarni yarating, nashr qiling va boshqaring.</h2>
          <p className="text-lg opacity-90">Filial adminlari va o&apos;qituvchilar uchun ishchi panel.</p>
        </div>
        <div className="relative flex items-center gap-2 text-sm font-bold opacity-90">
          <ShieldCheck className="size-5" />
          Faqat vakolatli xodimlar uchun
        </div>
      </aside>

      <section className="bg-playful flex flex-col px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-muted hover:bg-subtle hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Bosh sahifa
          </Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-7 py-8">
          <div className="space-y-3">
            <Logo className="lg:hidden" />
            <h1 className="text-3xl font-black tracking-tight">Tizimga kirish</h1>
            <p className="text-base text-muted">
              Faqat filial adminlari va o&apos;qituvchilar uchun. Login va parolni administrator beradi.
            </p>
          </div>
          <div className="rounded-3xl border-2 border-border-soft bg-surface p-5 shadow-md">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
