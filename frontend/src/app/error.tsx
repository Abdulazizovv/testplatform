"use client";

import { Home, RotateCcw, WifiOff } from "lucide-react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="bg-playful flex min-h-dvh w-full flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <WifiOff className="size-8" aria-hidden="true" />
      </span>
      <h1 className="text-3xl font-black tracking-tight">Sahifani yuklab bo&apos;lmadi</h1>
      <p className="max-w-md text-muted">Server bilan bog&apos;lanishda muammo bo&apos;ldi. Birozdan so&apos;ng qayta urinib ko&apos;ring.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={reset}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Qayta urinish
        </Button>
        <Link href="/" className={buttonClass("secondary")}>
          <Home className="size-4" aria-hidden="true" />
          Bosh sahifa
        </Link>
      </div>
    </main>
  );
}
