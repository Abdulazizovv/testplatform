import { Home, SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="bg-playful flex min-h-dvh w-full flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <SearchX className="size-8" aria-hidden="true" />
      </span>
      <h1 className="text-3xl font-black tracking-tight">Sahifa topilmadi</h1>
      <p className="max-w-md text-muted">Siz izlagan sahifa mavjud emas yoki ko&apos;chirilgan.</p>
      <Link href="/" className={buttonClass("primary")}>
        <Home className="size-4" aria-hidden="true" />
        Bosh sahifaga qaytish
      </Link>
    </main>
  );
}
