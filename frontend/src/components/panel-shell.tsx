"use client";

import { Building2, BookOpen, ChevronDown, ClipboardCheck, ExternalLink, LayoutDashboard, LogOut, Menu, Users, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/lib/api";
import { ROLE_LABELS, type CurrentUser } from "@/lib/types";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ToastProvider } from "@/components/ui/toast";

export type NavIcon = "home" | "branch" | "users" | "subject" | "test";
export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

const ICONS: Record<NavIcon, LucideIcon> = {
  home: LayoutDashboard,
  branch: Building2,
  users: Users,
  subject: BookOpen,
  test: ClipboardCheck,
};

function displayName(user: CurrentUser) {
  return `${user.first_name} ${user.last_name}`.trim() || user.username;
}

function UserMenu({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onLogout() {
    setPending(true);
    try {
      await logout();
    } catch {
      /* the session may already be gone; go to the login page either way */
    }
    router.replace("/kirish");
    router.refresh();
  }

  const name = displayName(user);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-xl px-1.5 transition-colors hover:bg-subtle md:min-h-10"
      >
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-accent-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-bold sm:block">{name}</span>
        <ChevronDown className={cn("size-4 text-faint transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="anim-rise absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-border-soft bg-surface p-2 shadow-lg">
          <div className="border-b border-border-soft px-3 py-2">
            <p className="truncate text-sm font-extrabold">{name}</p>
            <p className="truncate text-sm text-muted">@{user.username}</p>
            <p className="mt-1.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">{ROLE_LABELS[user.role]}</p>
          </div>
          <Button variant="ghost" className="mt-1 w-full justify-start" onClick={onLogout} loading={pending}>
            <LogOut className="size-4" aria-hidden="true" />
            Chiqish
          </Button>
        </div>
      )}
    </div>
  );
}

export function PanelShell({ user, nav, children }: { user: CurrentUser; nav: NavItem[]; children: ReactNode }) {
  const pathname = usePathname();
  // The drawer is "open for" the path it was opened on, so navigating closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const drawerOpen = openFor === pathname;

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFor(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const isActive = (href: string) => (href === "/panel" ? pathname === href : pathname.startsWith(href));

  return (
    <ToastProvider>
      <div className="min-h-dvh md:pl-64">
        {drawerOpen && (
          <div className="fixed inset-0 z-30 bg-[var(--overlay)] md:hidden" onClick={() => setOpenFor(null)} aria-hidden="true" />
        )}
        <aside
          id="panel-sidebar"
          aria-label="Asosiy menyu"
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border-soft bg-surface transition-transform duration-200 md:visible md:translate-x-0",
            drawerOpen ? "translate-x-0 shadow-lg" : "invisible -translate-x-full",
          )}
        >
          <div className="flex h-16 items-center justify-between px-4">
            <Link href="/panel" className="rounded-xl" aria-label="Bilim sinovi, panel">
              <Logo />
            </Link>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menyuni yopish" onClick={() => setOpenFor(null)}>
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {nav.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-bold transition-colors",
                    active ? "bg-accent text-accent-foreground shadow-sm" : "text-muted hover:bg-subtle hover:text-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border-soft p-3">
            <Link
              href="/"
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-muted transition-colors hover:bg-subtle hover:text-foreground"
            >
              <ExternalLink className="size-5 shrink-0" aria-hidden="true" />
              O&apos;quvchilar sahifasi
            </Link>
          </div>
        </aside>

        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border-soft bg-background/85 px-4 backdrop-blur-md md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 md:hidden"
                aria-label="Menyuni ochish"
                aria-expanded={drawerOpen}
                aria-controls="panel-sidebar"
                onClick={() => setOpenFor(pathname)}
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
              <p className="flex min-w-0 items-center gap-2 rounded-full bg-subtle py-1.5 pl-2.5 pr-3.5 text-sm font-bold">
                <Building2 className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">{user.branch ? user.branch.name : "Barcha filiallar"}</span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <UserMenu user={user} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
