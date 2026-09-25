import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { UsersView } from "./users-view";

export const metadata: Metadata = { title: "Foydalanuvchilar" };

export default async function UsersPage() {
  const me = await requireUser(["superadmin", "admin"]);
  return <UsersView me={me} />;
}
