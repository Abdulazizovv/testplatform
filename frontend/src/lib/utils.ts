/** URL-safe slug from a name (Uzbek apostrophes dropped: "o'quv" -> "oquv"). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ʻʼ'‘’`]/g, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function fullName(u: { first_name: string; last_name: string; username: string }): string {
  return `${u.first_name} ${u.last_name}`.trim() || u.username;
}

const dateFormat = new Intl.DateTimeFormat("uz-Latn", { day: "2-digit", month: "2-digit", year: "numeric" });
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFormat.format(d);
}
