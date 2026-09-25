"use client";

import { useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiGetAll, apiPatch, apiPost, formErrors } from "@/lib/api";
import { useDebounced, useFetch } from "@/lib/hooks";
import { ROLE_LABELS, type BranchFull, type CurrentUser, type ManagedUser, type Paginated, type Role, type Subject } from "@/lib/types";
import { formatDate, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, Loading, Notice, PageHeader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

const PAGE_SIZE = 20;
type Errors = { fields: Record<string, string>; general: string | null };
const NO_ERRORS: Errors = { fields: {}, general: null };

function SubjectPicker({
  branchId,
  value,
  onChange,
  error,
}: {
  branchId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const { data, error: loadError, loading } = useFetch(`subjects-picker:${branchId ?? "own"}`, () =>
    apiGetAll<Subject>("/api/v1/subjects/", { branch: branchId ?? undefined }),
  );
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">Biriktirilgan fanlar</legend>
      {loading && !data ? (
        <p className="text-sm text-muted">Fanlar yuklanmoqda...</p>
      ) : loadError ? (
        <p className="text-sm text-danger">{loadError}</p>
      ) : data && data.length === 0 ? (
        <p className="text-sm text-muted">Bu filialda hali fan yo&apos;q. Avval &quot;Fanlar&quot; bo&apos;limida fan yarating.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border px-3 py-1">
          {data?.map((s) => (
            <Checkbox
              key={s.id}
              label={s.name}
              checked={value.includes(s.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))}
            />
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function UserForm({
  me,
  user,
  onClose,
  onSaved,
}: {
  me: CurrentUser;
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isSuper = me.role === "superadmin";
  const editing = user !== null;
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "teacher");
  const [branchId, setBranchId] = useState<string>(user?.branch?.id ?? "");
  const [subjects, setSubjects] = useState<string[]>(user?.subjects ?? []);
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);

  const branches = useFetch(`branches-all:${isSuper}`, () =>
    isSuper ? apiGetAll<BranchFull>("/api/v1/branches/") : Promise.resolve([] as BranchFull[]),
  );
  const roleLocked = editing && (user.id === me.id || user.role === "superadmin");
  const effectiveBranch = editing ? (user.branch?.id ?? null) : isSuper ? branchId || null : (me.branch?.id ?? null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors(NO_ERRORS);
    try {
      const body: Record<string, unknown> = {
        username: username.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
        is_active: isActive,
      };
      if (role === "teacher") body.subjects = subjects;
      if (editing) {
        if (roleLocked) delete body.role;
        await apiPatch(`/api/v1/users/${user.id}/`, body);
      } else {
        body.password = password;
        if (isSuper && role !== "superadmin") body.branch_id = branchId;
        await apiPost("/api/v1/users/", body);
      }
      toast.success(editing ? "Foydalanuvchi yangilandi." : "Foydalanuvchi yaratildi.");
      onSaved();
      onClose();
    } catch (err) {
      setErrors(formErrors(err));
      setPending(false);
    }
  }

  const roleOptions: Role[] = isSuper ? ["teacher", "admin", "superadmin"] : ["teacher", "admin"];
  const showBranch = !editing && isSuper && role !== "superadmin";

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      title={editing ? "Foydalanuvchini tahrirlash" : "Yangi foydalanuvchi"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="user-form" loading={pending}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.general && <Notice>{errors.general}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ism" error={errors.fields.first_name}>
            {(p) => <Input {...p} value={firstName} maxLength={150} autoComplete="off" onChange={(e) => setFirstName(e.target.value)} />}
          </Field>
          <Field label="Familiya" error={errors.fields.last_name}>
            {(p) => <Input {...p} value={lastName} maxLength={150} autoComplete="off" onChange={(e) => setLastName(e.target.value)} />}
          </Field>
        </div>
        <Field label="Login" error={errors.fields.username}>
          {(p) => (
            <Input
              {...p}
              value={username}
              maxLength={150}
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
        </Field>
        {!editing && (
          <Field label="Parol" hint="Kamida 10 belgi; oson topiladigan yoki faqat raqamli parol qabul qilinmaydi." error={errors.fields.password}>
            {(p) => <Input {...p} type="password" value={password} required autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        )}
        <Field label="Rol" error={errors.fields.role} hint={roleLocked ? "Bu foydalanuvchining rolini o'zgartirib bo'lmaydi." : undefined}>
          {(p) => (
            <Select
              {...p}
              value={role}
              disabled={roleLocked}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setSubjects([]);
              }}
            >
              {(roleLocked ? [role] : roleOptions).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {showBranch && (
          <Field label="Filial" error={errors.fields.branch_id}>
            {(p) => (
              <Select {...p} value={branchId} required onChange={(e) => { setBranchId(e.target.value); setSubjects([]); }}>
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
        {editing && user.branch && (
          <p className="text-sm text-muted">
            Filial: <span className="font-medium text-foreground">{user.branch.name}</span> (o&apos;zgartirib bo&apos;lmaydi)
          </p>
        )}
        {role === "teacher" && (isSuper && !editing ? !!effectiveBranch : true) && (
          <SubjectPicker branchId={isSuper ? effectiveBranch : null} value={subjects} onChange={setSubjects} error={errors.fields.subjects} />
        )}
        {role === "teacher" && isSuper && !editing && !effectiveBranch && (
          <p className="text-sm text-muted">Fanlarni biriktirish uchun avval filialni tanlang.</p>
        )}
        {editing && user.id !== me.id && <Checkbox label="Hisob faol" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
      </form>
    </Dialog>
  );
}

function PasswordForm({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors(NO_ERRORS);
    try {
      await apiPatch(`/api/v1/users/${user.id}/`, { password });
      toast.success("Parol o'zgartirildi.");
      onClose();
    } catch (err) {
      setErrors(formErrors(err));
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      size="sm"
      onClose={() => !pending && onClose()}
      title="Parolni o'zgartirish"
      description={`@${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="password-form" loading={pending}>
            O&apos;zgartirish
          </Button>
        </>
      }
    >
      <form id="password-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {errors.general && <Notice>{errors.general}</Notice>}
        <Field label="Yangi parol" hint="Kamida 10 belgi." error={errors.fields.password}>
          {(p) => <Input {...p} type="password" value={password} required autoFocus autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}

export function UsersView({ me }: { me: CurrentUser }) {
  const toast = useToast();
  const isSuper = me.role === "superadmin";
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [active, setActive] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);
  const [passwordFor, setPasswordFor] = useState<ManagedUser | null>(null);
  const [deactivating, setDeactivating] = useState<ManagedUser | null>(null);

  const { data, error, loading, reload } = useFetch(`users:${page}:${role}:${active}:${debouncedSearch}`, () =>
    apiGet<Paginated<ManagedUser>>("/api/v1/users/", {
      page,
      page_size: PAGE_SIZE,
      role,
      is_active: active,
      search: debouncedSearch,
    }),
  );

  function filter(fn: () => void) {
    fn();
    setPage(1);
  }

  async function activate(user: ManagedUser) {
    try {
      await apiPatch(`/api/v1/users/${user.id}/`, { is_active: true });
      toast.success("Hisob faollashtirildi.");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xatolik yuz berdi.");
    }
  }

  const filtered = role !== "" || active !== "" || debouncedSearch !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Foydalanuvchilar"
        description={isSuper ? "Barcha filiallar xodimlari." : "Filialingiz adminlari va o'qituvchilari."}
        actions={<Button onClick={() => setEditing("new")}>Yangi foydalanuvchi</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          type="search"
          aria-label="Qidirish"
          placeholder="Ism yoki login bo'yicha qidirish"
          value={search}
          onChange={(e) => filter(() => setSearch(e.target.value))}
        />
        <Select aria-label="Rol bo'yicha" value={role} onChange={(e) => filter(() => setRole(e.target.value))}>
          <option value="">Barcha rollar</option>
          {isSuper && <option value="superadmin">{ROLE_LABELS.superadmin}</option>}
          <option value="admin">{ROLE_LABELS.admin}</option>
          <option value="teacher">{ROLE_LABELS.teacher}</option>
        </Select>
        <Select aria-label="Holat bo'yicha" value={active} onChange={(e) => filter(() => setActive(e.target.value))}>
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
          title={filtered ? "Hech narsa topilmadi" : "Foydalanuvchilar yo'q"}
          hint={filtered ? "Qidiruv yoki filtrlarni o'zgartirib ko'ring." : undefined}
        />
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : undefined}>
          {error && <Notice className="mb-3">{error}</Notice>}
          <ul className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft bg-surface shadow-sm">
            {data.results.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-medium">{fullName(u)}</p>
                    <Badge tone={u.role === "teacher" ? "neutral" : "accent"}>{ROLE_LABELS[u.role]}</Badge>
                    {!u.is_active && <Badge tone="warning">Faolsiz</Badge>}
                    {u.id === me.id && <Badge>Siz</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted">
                    @{u.username}
                    {isSuper && ` · ${u.branch ? u.branch.name : "Barcha filiallar"}`}
                    {u.role === "teacher" && ` · ${u.subjects.length} ta fan`}
                    {` · oxirgi kirish: ${formatDate(u.last_login)}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>
                    Tahrirlash
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setPasswordFor(u)}>
                    Parol
                  </Button>
                  {u.id !== me.id &&
                    (u.is_active ? (
                      <Button variant="secondary" size="sm" onClick={() => setDeactivating(u)}>
                        Faolsizlantirish
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => activate(u)}>
                        Faollashtirish
                      </Button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />
        </div>
      )}

      {editing && <UserForm me={me} user={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {passwordFor && <PasswordForm user={passwordFor} onClose={() => setPasswordFor(null)} />}
      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        title="Hisobni faolsizlantirasizmi?"
        message={`@${deactivating?.username ?? ""} tizimga kira olmaydi. Ma'lumotlari saqlanadi, keyinroq qayta faollashtirish mumkin.`}
        confirmLabel="Faolsizlantirish"
        danger
        onConfirm={async () => {
          if (!deactivating) return;
          await apiDelete(`/api/v1/users/${deactivating.id}/`);
          toast.success("Hisob faolsizlantirildi.");
          reload();
        }}
      />
    </div>
  );
}
