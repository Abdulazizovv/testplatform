import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { BranchesView } from "./branches-view";

export const metadata: Metadata = { title: "Filiallar" };

export default async function BranchesPage() {
  await requireUser(["superadmin"]);
  return <BranchesView />;
}
