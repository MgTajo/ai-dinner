// Time helpers. The app runs on a "scenario clock" so a live demo always starts at the same
// point of the day (16:40, before the last meeting) and can be fast-forwarded.

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface ClockState {
  mode: "scenario" | "real";
  /** Real time when the scenario clock was last anchored. */
  anchorReal: number;
  /** Scenario time at that moment. */
  anchorScenario: number;
  /** How many scenario minutes pass per real minute. */
  speed: number;
}

export const SCENARIO_START = "16:40";

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "18:30" on the day of `dayMs`. */
export function atTime(dayMs: number, hhmm: string): number {
  // setHours, not midnight + n hours: on clock-change days the day isn't 24 hours long.
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dayMs);
  d.setHours(h, m || 0, 0, 0);
  return d.getTime();
}

export function scenarioClock(realNow = Date.now()): ClockState {
  return { mode: "scenario", anchorReal: realNow, anchorScenario: atTime(realNow, SCENARIO_START), speed: 1 };
}

export function clockNow(clock: ClockState, realNow = Date.now()): number {
  if (clock.mode === "real") return realNow;
  return clock.anchorScenario + (realNow - clock.anchorReal) * clock.speed;
}

/** Re-anchors the clock at `scenarioMs`, keeping its speed. */
export function setClock(clock: ClockState, scenarioMs: number, realNow = Date.now()): ClockState {
  return { ...clock, mode: "scenario", anchorReal: realNow, anchorScenario: scenarioMs };
}

export function hoursOf(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toHHMM(ms: number): string {
  return fmtTime(ms);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function weekday(ms: number): string {
  return WEEKDAYS[new Date(ms).getDay()];
}

/** "Today", "Yesterday", "Thursday" (within a week) or "12 Oct". */
export function relativeDay(ms: number, now: number): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  if (diff > 1 && diff < 7) return weekday(ms);
  return fmtShortDate(ms);
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "in 25 min", "in 1 h 05 min", "4 min ago". */
export function fmtRelative(ms: number, now: number): string {
  const minutes = Math.round((ms - now) / MINUTE);
  const abs = Math.abs(minutes);
  const span = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)} h${abs % 60 ? ` ${pad(abs % 60)} min` : ""}`;
  if (abs === 0) return "now";
  return minutes > 0 ? `in ${span}` : `${span} ago`;
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}

export function greeting(ms: number): string {
  const h = hoursOf(ms);
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
