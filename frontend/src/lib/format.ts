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
