import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { SubjectsView } from "./subjects-view";

export const metadata: Metadata = { title: "Fanlar" };

export default async function SubjectsPage() {
  const me = await requireUser();
  return <SubjectsView me={me} />;
}
