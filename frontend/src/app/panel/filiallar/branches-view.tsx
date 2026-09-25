"use client";

import { useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost, formErrors } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import type { BranchFull, Paginated } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, Loading, Notice, PageHeader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 20;

function BranchForm({ branch, onClose, onSaved }: { branch: BranchFull | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(branch?.name ?? "");
  const [slug, setSlug] = useState(branch?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!branch);
  const [address, setAddress] = useState(branch?.address ?? "");
  const [isActive, setIsActive] = useState(branch?.is_active ?? true);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ fields: Record<string, string>; general: string | null }>({ fields: {}, general: null });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({ fields: {}, general: null });
    try {
      const body = { name: name.trim(), slug: slug.trim(), address: address.trim(), is_active: isActive };
      if (branch) await apiPatch(`/api/v1/branches/${branch.id}/`, body);
      else await apiPost("/api/v1/branches/", body);
      toast.success(branch ? "Filial yangilandi." : "Filial yaratildi.");
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
      title={branch ? "Filialni tahrirlash" : "Yangi filial"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="branch-form" loading={pending}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="branch-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.general && <Notice>{errors.general}</Notice>}
        <Field label="Nomi" error={errors.fields.name}>
          {(p) => (
            <Input
              {...p}
              value={name}
              maxLength={200}
              required
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          )}
        </Field>
        <Field label="Slug" hint="Havola uchun qisqa nom: faqat lotin harflari, raqam va chiziqcha." error={errors.fields.slug}>
          {(p) => (
            <Input
              {...p}
              value={slug}
              maxLength={80}
              required
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Manzil" error={errors.fields.address}>
          {(p) => <Input {...p} value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <Checkbox label="Filial faol" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        {!isActive && (
          <Notice tone="warning">Nofaol filialning xodimlari tizimga kira olmaydi.</Notice>
        )}
      </form>
    </Dialog>
  );
}

export function BranchesView() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<BranchFull | "new" | null>(null);
  const [toggling, setToggling] = useState<BranchFull | null>(null);
  const { data, error, loading, reload } = useFetch(`branches:${page}`, () =>
    apiGet<Paginated<BranchFull>>("/api/v1/branches/", { page, page_size: PAGE_SIZE }),
  );

  async function setActive(branch: BranchFull, active: boolean) {
    await apiPatch(`/api/v1/branches/${branch.id}/`, { is_active: active });
    toast.success(active ? "Filial faollashtirildi." : "Filial nofaol qilindi.");
    reload();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Filiallar"
        description="Filiallarni yaratish va boshqarish."
        actions={<Button onClick={() => setEditing("new")}>Yangi filial</Button>}
      />

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <Loading />
      ) : data.results.length === 0 ? (
        <EmptyState
          title="Hozircha filial yo'q"
          hint="Birinchi filialni yarating, keyin unga admin va o'qituvchilar qo'shing."
          action={<Button onClick={() => setEditing("new")}>Filial yaratish</Button>}
        />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : undefined}>
          {error && <Notice className="mb-3">{error}</Notice>}
          <ul className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface shadow-sm">
            {data.results.map((b) => (
              <li key={b.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-medium">{b.name}</p>
                    <Badge tone={b.is_active ? "success" : "neutral"}>{b.is_active ? "Faol" : "Nofaol"}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted">
                    {b.slug}
                    {b.address ? ` · ${b.address}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(b)}>
                    Tahrirlash
                  </Button>
                  {b.is_active ? (
                    <Button variant="secondary" size="sm" onClick={() => setToggling(b)}>
                      Nofaol qilish
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setActive(b, true).catch((e: Error) => toast.error(e.message))}>
                      Faollashtirish
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />
        </div>
      )}

      {editing && (
        <BranchForm branch={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
      <ConfirmDialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        title="Filialni nofaol qilasizmi?"
        message={`"${toggling?.name ?? ""}" filialining barcha xodimlari tizimga kira olmaydi va ochiq sessiyalari to'xtaydi. Keyinroq qayta faollashtirish mumkin.`}
        confirmLabel="Nofaol qilish"
        danger
        onConfirm={() => (toggling ? setActive(toggling, false) : Promise.resolve())}
      />
    </div>
  );
}
