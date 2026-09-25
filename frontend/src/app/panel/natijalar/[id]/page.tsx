import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { AttemptView } from "./attempt-view";

export const metadata: Metadata = { title: "Natija" };

export default async function AttemptPage({ params }: PageProps<"/panel/natijalar/[id]">) {
  await requireUser();
  const { id } = await params;
  return <AttemptView id={id} />;
}
