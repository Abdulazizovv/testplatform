import type { Metadata } from "next";
import { PanelShell, type NavItem } from "@/components/panel-shell";
import { requireUser } from "@/lib/session";
import type { Role } from "@/lib/types";

export const metadata: Metadata = { title: { default: "Panel", template: "%s | Panel" } };
export const dynamic = "force-dynamic";

const NAV: Array<NavItem & { roles: Role[] }> = [
  { href: "/panel", label: "Bosh sahifa", icon: "home", roles: ["superadmin", "admin", "teacher"] },
  { href: "/panel/filiallar", label: "Filiallar", icon: "branch", roles: ["superadmin"] },
  { href: "/panel/foydalanuvchilar", label: "Foydalanuvchilar", icon: "users", roles: ["superadmin", "admin"] },
  { href: "/panel/fanlar", label: "Fanlar", icon: "subject", roles: ["superadmin", "admin", "teacher"] },
  { href: "/panel/testlar", label: "Testlar", icon: "test", roles: ["superadmin", "admin", "teacher"] },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = NAV.filter((item) => item.roles.includes(user.role)).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <PanelShell user={user} nav={nav}>
      {children}
    </PanelShell>
  );
}
