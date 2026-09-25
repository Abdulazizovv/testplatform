import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { TestSummaryView } from "./test-summary-view";

export const metadata: Metadata = { title: "Test tahlili" };

export default async function TestSummaryPage({ params }: PageProps<"/panel/natijalar/test/[id]">) {
  await requireUser();
  const { id } = await params;
  return <TestSummaryView id={id} />;
}
