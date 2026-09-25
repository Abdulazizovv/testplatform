/** "30 daqiqa", "1 soat 30 daqiqa", "45 soniya"; null = no limit. */
export function formatLimit(sec: number | null): string {
  if (sec === null) return "Cheklanmagan";
  if (sec < 60) return `${sec} soniya`;
  const minutes = Math.round(sec / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} daqiqa`;
  return m === 0 ? `${h} soat` : `${h} soat ${m} daqiqa`;
}

/** Countdown text: 05:07 or 1:05:07. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** "12 daq 30 s", "45 s", "1 soat 5 daq"; "—" when unknown. */
export function formatDuration(sec: number | null): string {
  if (sec === null || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} soat`);
  if (m) parts.push(`${m} daq`);
  if (s && !h) parts.push(`${s} s`);
  return parts.join(" ") || "0 s";
}

/** "70" / "66.7" from a decimal string or number. */
export function formatPercent(value: string | number | null): string {
  if (value === null) return "—";
  return `${Number(Number(value).toFixed(1))}%`;
}

const dateTimeFormat = new Intl.DateTimeFormat("uz-Latn", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tashkent",
});
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFormat.format(d);
}
