"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiGet, apiGetAll } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { TEST_STATUS_LABELS, type CurrentUser, type Paginated, type Subject, type TestItem, type TestStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { TestActions, statusTone } from "@/components/test-actions";
import { TestForm } from "@/components/test-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, Loading, Notice, PageHeader } from "@/components/ui/states";

const PAGE_SIZE = 20;

function minutesLabel(sec: number | null) {
  if (!sec) return "vaqt cheklanmagan";
  const m = sec / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)} daqiqa`;
}

function TestRow({ me, test, reload }: { me: CurrentUser; test: TestItem; reload: () => void }) {
  const router = useRouter();
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface p-4 shadow-sm transition-shadow hover:shadow-md lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/panel/testlar/${test.id}`} className="truncate text-base font-medium text-lg font-extrabold hover:text-accent">
            {test.title}
          </Link>
          <Badge tone={statusTone(test.status)}>{TEST_STATUS_LABELS[test.status]}</Badge>
        </div>
        <p className="text-sm text-muted">
          {test.subject_name} · {test.question_count} ta savol · {minutesLabel(test.time_limit_sec)}
          {test.author_name ? ` · ${test.author_name}` : ""} · {formatDate(test.updated_at)}
        </p>
      </div>
      <TestActions me={me} test={test} onChanged={reload} onDeleted={reload} onDuplicated={(copy) => router.push(`/panel/testlar/${copy.id}`)}>
        {({ run, duplicate, remove, canDelete, busy }) => (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={`/panel/testlar/${test.id}`} className={buttonClass("secondary", "sm")}>
              Ochish
            </Link>
            {test.status !== "published" && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => run("publish")}>
                Nashr qilish
              </Button>
            )}
            {test.status === "published" && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => run("unpublish")}>
                Qoralamaga qaytarish
              </Button>
            )}
            {test.status !== "archived" && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => run("archive")}>
                Arxivlash
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={duplicate}>
              Nusxa olish
            </Button>
            {canDelete && (
              <Button variant="secondary" size="sm" onClick={remove}>
                O&apos;chirish
              </Button>
            )}
          </div>
        )}
      </TestActions>
    </li>
  );
}

export function TestsView({ me, initialSubject }: { me: CurrentUser; initialSubject: string }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [subject, setSubject] = useState(initialSubject);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [creating, setCreating] = useState(false);

  const subjects = useFetch("subjects-all", () => apiGetAll<Subject>("/api/v1/subjects/"));
  const { data, error, loading, reload } = useFetch(`tests:${page}:${subject}:${status}:${debouncedSearch}`, () =>
    apiGet<Paginated<TestItem>>("/api/v1/tests/", { page, page_size: PAGE_SIZE, subject, status, search: debouncedSearch }),
  );
  const filtered = subject !== "" || status !== "" || debouncedSearch !== "";
  const noSubjects = subjects.data !== null && subjects.data.length === 0;

  function filter(fn: () => void) {
    fn();
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testlar"
        description="Testlarni yarating, savollarini tahrirlang va nashr qiling."
        actions={
          <Button onClick={() => setCreating(true)} disabled={noSubjects}>
            Yangi test
          </Button>
        }
      />

      {noSubjects && (
        <Notice tone="warning">
          {me.role === "teacher"
            ? "Sizga hali fan biriktirilmagan. Test yaratish uchun filial adminiga murojaat qiling."
            : "Test yaratish uchun avval \"Fanlar\" bo'limida fan yarating."}
        </Notice>
      )}

      <div className="grid gap-3 md:grid-cols-[1fr_14rem_12rem]">
        <Input
          type="search"
          aria-label="Qidirish"
          placeholder="Sarlavha bo'yicha qidirish"
          value={search}
          onChange={(e) => filter(() => setSearch(e.target.value))}
        />
        <Select aria-label="Fan bo'yicha" value={subject} onChange={(e) => filter(() => setSubject(e.target.value))}>
          <option value="">Barcha fanlar</option>
          {subjects.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {me.role === "superadmin" ? `${s.name} (${s.branch.name})` : s.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Holat bo'yicha" value={status} onChange={(e) => filter(() => setStatus(e.target.value))}>
          <option value="">Barcha holatlar</option>
          {(Object.keys(TEST_STATUS_LABELS) as TestStatus[]).map((s) => (
            <option key={s} value={s}>
              {TEST_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : data.results.length === 0 ? (
        <EmptyState
          title={filtered ? "Hech narsa topilmadi" : "Hozircha test yo'q"}
          hint={filtered ? "Qidiruv yoki filtrlarni o'zgartirib ko'ring." : "Birinchi testni yarating va savollar qo'shing."}
          action={!filtered && !noSubjects ? <Button onClick={() => setCreating(true)}>Test yaratish</Button> : undefined}
        />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : undefined}>
          {error && <Notice className="mb-3">{error}</Notice>}
          <ul className="space-y-3">
            {data.results.map((t) => (
              <TestRow key={t.id} me={me} test={t} reload={reload} />
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />
        </div>
      )}

      {creating && (
        <TestForm
          me={me}
          test={null}
          defaultSubject={subject}
          onClose={() => setCreating(false)}
          onSaved={(t) => router.push(`/panel/testlar/${t.id}`)}
        />
      )}
    </div>
  );
}
