import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { TestsView } from "./tests-view";

export const metadata: Metadata = { title: "Testlar" };

export default async function TestsPage({ searchParams }: PageProps<"/panel/testlar">) {
  const me = await requireUser();
  const { subject } = await searchParams;
  return <TestsView me={me} initialSubject={typeof subject === "string" ? subject : ""} />;
}
