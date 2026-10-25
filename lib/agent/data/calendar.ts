import { atTime } from "../time";
import type { CalendarEvent } from "../types";

// A mock work calendar for the scenario day. The story: back-to-back meetings until an investor
// call that ends at 18:00, then five-a-side football at 20:00, so dinner should land shortly
// after 18:00 and be on the lighter side.

const plan: (Omit<CalendarEvent, "start" | "end" | "id"> & { from: string; to: string })[] = [
  { title: "Team standup", from: "09:15", to: "09:30", kind: "meeting", where: "Google Meet" },
  { title: "Focus: pitch deck", from: "09:30", to: "11:00", kind: "focus" },
  { title: "Product review", from: "11:00", to: "12:00", kind: "meeting", where: "Room 2.04" },
  { title: "Lunch with Priya", from: "12:30", to: "13:15", kind: "meal", where: "Mill Road" },
  { title: "Hiring panel", from: "13:30", to: "14:30", kind: "meeting", where: "Room 1.12" },
  { title: "Design critique", from: "15:00", to: "16:00", kind: "meeting", where: "Studio" },
  { title: "1:1 with Jonas", from: "16:15", to: "16:45", kind: "meeting", where: "Google Meet" },
  { title: "Investor sync", from: "17:00", to: "18:00", kind: "meeting", where: "Zoom" },
  { title: "Five-a-side football", from: "20:00", to: "21:00", kind: "personal", where: "Parker's Piece", active: true },
];

export function buildCalendar(dayMs: number): CalendarEvent[] {
  return plan.map(({ from, to, ...e }, i) => ({
    ...e,
    id: `evt-${i}-${from.replace(":", "")}`,
    start: atTime(dayMs, from),
    end: atTime(dayMs, to),
  }));
}
