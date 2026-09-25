"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiGetAll, apiPatch, apiPost, formErrors } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import type { BranchFull, CurrentUser, Paginated, Subject } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, Loading, Notice, PageHeader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 20;
type Errors = { fields: Record<string, string>; general: string | null };
const NO_ERRORS: Errors = { fields: {}, general: null };

function useBranches(enabled: boolean) {
  return useFetch(`branches-all:${enabled}`, () =>
    enabled ? apiGetAll<BranchFull>("/api/v1/branches/") : Promise.resolve([] as BranchFull[]),
  );
}

function SubjectForm({ me, subject, onClose, onSaved }: { me: CurrentUser; subject: Subject | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isSuper = me.role === "superadmin";
  const [name, setName] = useState(subject?.name ?? "");
  const [description, setDescription] = useState(subject?.description ?? "");
  const [isActive, setIsActive] = useState(subject?.is_active ?? true);
  const [branchId, setBranchId] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const branches = useBranches(isSuper && !subject);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors(NO_ERRORS);
    try {
      const body: Record<string, unknown> = { name: name.trim(), description: description.trim(), is_active: isActive };
      if (subject) await apiPatch(`/api/v1/subjects/${subject.id}/`, body);
      else {
        if (isSuper) body.branch_id = branchId;
        await apiPost("/api/v1/subjects/", body);
      }
      toast.success(subject ? "Fan yangilandi." : "Fan yaratildi.");
      onSaved();
      onClose();
    } catch (err) {
      setErrors(formErrors(err));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      title={subject ? "Fanni tahrirlash" : "Yangi fan"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="subject-form" loading={pending}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.general && <Notice>{errors.general}</Notice>}
        <Field label="Nomi" error={errors.fields.name}>
          {(p) => <Input {...p} value={name} maxLength={200} required autoFocus onChange={(e) => setName(e.target.value)} />}
        </Field>
        {isSuper && !subject && (
          <Field label="Filial" error={errors.fields.branch_id}>
            {(p) => (
              <Select {...p} value={branchId} required onChange={(e) => setBranchId(e.target.value)}>
                <option value="">{branches.loading ? "Yuklanmoqda..." : "Filialni tanlang"}</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Tavsif" error={errors.fields.description}>
          {(p) => <Textarea {...p} value={description} rows={3} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Checkbox label="Fan faol" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </form>
    </Dialog>
  );
}

function CloneForm({ me, subject, onClose, onSaved }: { me: CurrentUser; subject: Subject; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isSuper = me.role === "superadmin";
  const [target, setTarget] = useState(isSuper ? subject.branch.id : (me.branch?.id ?? ""));
  const [name, setName] = useState(`${subject.name} (nusxa)`);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const branches = useBranches(isSuper);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors(NO_ERRORS);
    try {
      await apiPost(`/api/v1/subjects/${subject.id}/clone/`, { target_branch: target, name: name.trim() });
      toast.success("Nusxa yaratildi. Testlar qoralama holatida ko'chirildi.");
      onSaved();
      onClose();
    } catch (err) {
      setErrors(formErrors(err));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      title="Fanni nusxalash"
      description={`"${subject.name}" fani barcha testlari, savollari va rasmlari bilan nusxalanadi. Testlar qoralama bo'lib qoladi.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="clone-form" loading={pending} disabled={!target}>
            Nusxa olish
          </Button>
        </>
      }
    >
      <form id="clone-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.general && <Notice>{errors.general}</Notice>}
        <Field
          label="Qaysi filialga"
          error={errors.fields.target_branch}
          hint={isSuper ? undefined : "Admin fanni faqat o'z filialida nusxalay oladi."}
        >
          {(p) =>
            isSuper ? (
              <Select {...p} value={target} required onChange={(e) => setTarget(e.target.value)}>
                {branches.loading && <option value={target}>Yuklanmoqda...</option>}
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Select {...p} value={target} disabled>
                <option value={target}>{me.branch?.name}</option>
              </Select>
            )
          }
        </Field>
        <Field label="Yangi fan nomi" error={errors.fields.name}>
          {(p) => <Input {...p} value={name} maxLength={200} required onChange={(e) => setName(e.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}

export function SubjectsView({ me }: { me: CurrentUser }) {
  const toast = useToast();
  const isSuper = me.role === "superadmin";
  const canManage = me.role !== "teacher";
  const [page, setPage] = useState(1);
  const [branch, setBranch] = useState("");
  const [active, setActive] = useState("");
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const [cloning, setCloning] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const branches = useBranches(isSuper);

  const { data, error, loading, reload } = useFetch(`subjects:${page}:${branch}:${active}`, () =>
    apiGet<Paginated<Subject>>("/api/v1/subjects/", { page, page_size: PAGE_SIZE, branch, is_active: active }),
  );
  const filtered = branch !== "" || active !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fanlar"
        description={me.role === "teacher" ? "Sizga biriktirilgan fanlar." : "Fanlarni boshqarish va o'qituvchilarga biriktirish uchun asos."}
        actions={canManage && <Button onClick={() => setEditing("new")}>Yangi fan</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        {isSuper && (
          <Select aria-label="Filial bo'yicha" value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }}>
            <option value="">Barcha filiallar</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Holat bo'yicha" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
          <option value="">Barcha holatlar</option>
          <option value="true">Faol</option>
          <option value="false">Faolsiz</option>
        </Select>
      </div>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : data.results.length === 0 ? (
        <EmptyState
          title={filtered ? "Hech narsa topilmadi" : me.role === "teacher" ? "Sizga hali fan biriktirilmagan" : "Hozircha fan yo'q"}
          hint={
            filtered
              ? "Filtrlarni o'zgartirib ko'ring."
              : me.role === "teacher"
                ? "Filial admini sizga fan biriktirgach, u shu yerda ko'rinadi."
                : "Birinchi fanni yarating, so'ng unga test qo'shing."
          }
          action={!filtered && canManage ? <Button onClick={() => setEditing("new")}>Fan yaratish</Button> : undefined}
        />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : undefined}>
          {error && <Notice className="mb-3">{error}</Notice>}
          <ul className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface shadow-sm">
            {data.results.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-medium">{s.name}</p>
                    {!s.is_active && <Badge tone="warning">Faolsiz</Badge>}
                  </div>
                  <p className="text-sm text-muted">
                    {isSuper && `${s.branch.name} · `}
                    {s.test_count} ta test
                  </p>
                  {s.description && <p className="line-clamp-2 text-sm text-muted">{s.description}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href={`/panel/testlar?subject=${s.id}`} className={buttonClass("secondary", "sm")}>
                    Testlar
                  </Link>
                  {canManage && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(s)}>
                        Tahrirlash
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setCloning(s)}>
                        Nusxa ko&apos;chirish
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setDeleting(s)}>
                        O&apos;chirish
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />
        </div>
      )}

      {editing && <SubjectForm me={me} subject={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {cloning && <CloneForm me={me} subject={cloning} onClose={() => setCloning(null)} onSaved={reload} />}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Fanni o'chirasizmi?"
        message={`"${deleting?.name ?? ""}" fani butunlay o'chiriladi. Agar fanda testlar bo'lsa, o'chirib bo'lmaydi: bunday holda uni faolsizlantiring.`}
        confirmLabel="O'chirish"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          await apiDelete(`/api/v1/subjects/${deleting.id}/`);
          toast.success("Fan o'chirildi.");
          reload();
        }}
      />
    </div>
  );
}
