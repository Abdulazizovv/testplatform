import type { ResultRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

/** Pass/fail badge; running and time-expired attempts get their own labels. */
export function ResultBadge({ row }: { row: Pick<ResultRow, "status" | "passed"> }) {
  if (row.status === "in_progress") return <Badge tone="neutral">Davom etmoqda</Badge>;
  const verdict = row.passed ? <Badge tone="success">O&apos;tdi</Badge> : <Badge tone="danger">O&apos;tmadi</Badge>;
  if (row.status === "expired") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {verdict}
        <Badge tone="warning">Vaqti tugagan</Badge>
      </span>
    );
  }
  return verdict;
}
