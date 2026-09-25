"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { apiGet, apiGetAll, downloadFile } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/format";
import { useDebounced, useFetch } from "@/lib/hooks";
import type { BranchFull, CurrentUser, ResultList, Subject, TestItem } from "@/lib/types";
import { ResultBadge } from "@/components/result-badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, Loading, Notice, PageHeader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 20;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="text-3xl font-black tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

export function ResultsView({ me, initialTest }: { me: CurrentUser; initialTest: string }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [test, setTest] = useState(initialTest);
  const [subject, setSubject] = useState("");
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState("");
  const [passed, setPassed] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebounced(search.trim());

  const isSuper = me.role === "superadmin";
  const tests = useFetch("results-tests", () => apiGetAll<TestItem>("/api/v1/tests/"));
  const subjects = useFetch("results-subjects", () => apiGetAll<Subject>("/api/v1/subjects/"));
  const branches = useFetch(`results-branches:${isSuper}`, () => (isSuper ? apiGetAll<BranchFull>("/api/v1/branches/") : Promise.resolve([])));

  const query = { test, subject, branch, status, passed, date_from: dateFrom, date_to: dateTo, search: debouncedSearch };
  const { data, error, loading, reload } = useFetch(`results:${page}:${JSON.stringify(query)}`, () =>
    apiGet<ResultList>("/api/v1/results/", { ...query, page, page_size: PAGE_SIZE }),
  );
  const filtered = Object.values(query).some((v) => v !== "");

  function filter(fn: () => void) {
    fn();
    setPage(1);
  }

  async function onExport() {
    setExporting(true);
    try {
      await downloadFile("/api/v1/results/export/", query);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Yuklab olib bo'lmadi.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Natijalar"
        description="O'quvchilarning test natijalari. Filtrlab, Excel'ga yuklab olishingiz mumkin."
        actions={
          <Button variant="secondary" onClick={onExport} loading={exporting} disabled={!data || data.count === 0}>
            <Download className="size-4" aria-hidden="true" />
            Excel&apos;ga yuklab olish
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ism bo'yicha qidirish" className="sm:col-span-2 lg:col-span-4">
          {(p) => <Input {...p} type="search" placeholder="O'quvchi ismi" value={search} onChange={(e) => filter(() => setSearch(e.target.value))} />}
        </Field>
        <Field label="Test">
          {(p) => (
            <Select {...p} value={test} onChange={(e) => filter(() => setTest(e.target.value))}>
              <option value="">Barcha testlar</option>
              {tests.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Fan">
          {(p) => (
            <Select {...p} value={subject} onChange={(e) => filter(() => setSubject(e.target.value))}>
              <option value="">Barcha fanlar</option>
              {subjects.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {isSuper ? `${s.name} (${s.branch.name})` : s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {isSuper && (
          <Field label="Filial">
            {(p) => (
              <Select {...p} value={branch} onChange={(e) => filter(() => setBranch(e.target.value))}>
                <option value="">Barcha filiallar</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Natija">
          {(p) => (
            <Select {...p} value={passed} onChange={(e) => filter(() => setPassed(e.target.value))}>
              <option value="">O&apos;tgan va o&apos;tmagan</option>
              <option value="true">Faqat o&apos;tganlar</option>
              <option value="false">Faqat o&apos;tmaganlar</option>
            </Select>
          )}
        </Field>
        <Field label="Holat">
          {(p) => (
            <Select {...p} value={status} onChange={(e) => filter(() => setStatus(e.target.value))}>
              <option value="">Yakunlanganlar</option>
              <option value="finished">Faqat o&apos;zi yakunlagan</option>
              <option value="expired">Vaqti tugagan</option>
              <option value="in_progress">Davom etayotgan</option>
            </Select>
          )}
        </Field>
        <Field label="Sanadan">
          {(p) => <Input {...p} type="date" value={dateFrom} onChange={(e) => filter(() => setDateFrom(e.target.value))} />}
        </Field>
        <Field label="Sanagacha">
          {(p) => <Input {...p} type="date" value={dateTo} onChange={(e) => filter(() => setDateTo(e.target.value))} />}
        </Field>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : undefined}>
          {error && <Notice className="mb-3">{error}</Notice>}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Urinishlar" value={String(data.summary.attempts)} />
            <Stat label="O'rtacha natija" value={formatPercent(data.summary.avg_percent)} />
            <Stat label="O'tganlar" value={formatPercent(data.summary.pass_rate)} />
          </div>
          {data.results.length === 0 ? (
            <EmptyState
              title={filtered ? "Hech narsa topilmadi" : "Hozircha natija yo'q"}
              hint={filtered ? "Filtrlarni o'zgartirib ko'ring." : "O'quvchilar test topshirgach, natijalar shu yerda paydo bo'ladi."}
            />
          ) : (
            <ul className="space-y-3">
              {data.results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/panel/natijalar/${r.id}`}
                    className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="min-w-0 space-y-1">
                      <span className="block truncate text-lg font-extrabold">
                        {r.full_name} <span className="text-sm font-semibold text-muted">· {r.age} yosh</span>
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {r.test.title} · {r.subject.name}
                        {isSuper ? ` · ${r.branch.name}` : ""} · {formatDateTime(r.started_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {r.status !== "in_progress" && (
                        <span className="text-right text-sm font-bold tabular-nums">
                          {r.score}/{r.max_score} · {formatPercent(r.percent)}
                        </span>
                      )}
                      <ResultBadge row={r} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
