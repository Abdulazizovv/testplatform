import type { Metadata } from "next";
import { Solver } from "./solver";

export const metadata: Metadata = { title: "Test yechish", robots: { index: false, follow: false } };

export default async function SolvePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Solver token={token} />;
}
