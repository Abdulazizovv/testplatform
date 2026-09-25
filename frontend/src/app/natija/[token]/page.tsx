import type { Metadata } from "next";
import { ResultView } from "./result-view";

export const metadata: Metadata = { title: "Natija", robots: { index: false, follow: false } };

export default async function ResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResultView token={token} />;
}
