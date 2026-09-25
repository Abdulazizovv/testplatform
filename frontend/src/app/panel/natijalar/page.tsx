import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { ResultsView } from "./results-view";

export const metadata: Metadata = { title: "Natijalar" };

export default async function ResultsPage({ searchParams }: PageProps<"/panel/natijalar">) {
  const me = await requireUser();
  const { test } = await searchParams;
  return <ResultsView me={me} initialTest={typeof test === "string" ? test : ""} />;
}
