import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { TestEditor } from "./test-editor";

export const metadata: Metadata = { title: "Test muharriri" };

export default async function TestEditorPage({ params }: PageProps<"/panel/testlar/[id]">) {
  const me = await requireUser();
  const { id } = await params;
  return <TestEditor me={me} testId={id} />;
}
