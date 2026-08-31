import { addDays, weekdayOf } from "@/lib/booking";
import type { BusinessHour, Range } from "./types";

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Whether `hour` falls within the establishment's configured business hours for that weekday. */
export function isHourAvailable(hours: BusinessHour | undefined, hour: number) {
  if (!hours || hours.closed) return false;
  const openHour = Number(hours.opens_at.slice(0, 2));
  const [closeHh, closeMm] = hours.closes_at.split(":").map(Number);
  const closeHour = (closeMm ?? 0) > 0 ? (closeHh ?? 0) + 1 : (closeHh ?? 0);
  if (hour < openHour || hour >= closeHour) return false;
  if (hours.break_start && hours.break_end) {
    const breakStart = toMinutes(hours.break_start);
    const breakEnd = toMinutes(hours.break_end);
    const slotStart = hour * 60;
    const slotEnd = slotStart + 60;
    if (slotStart < breakEnd && slotEnd > breakStart) return false;
  }
  return true;
}

export function rangeBounds(anchor: string, range: Range) {
  if (range === "week") {
    const start = addDays(anchor, -weekdayOf(anchor));
    return { from: start, to: addDays(start, 7) };
  }
  const start = `${anchor.slice(0, 7)}-01`;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { from: start, to: d.toISOString().slice(0, 10) };
}

/** Full-week-aligned grid of days covering the month containing `anchor`. */
export function monthGrid(anchor: string) {
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const d = new Date(`${monthStart}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = addDays(d.toISOString().slice(0, 10), -1);
  const gridStart = addDays(monthStart, -weekdayOf(monthStart));
  const gridEnd = addDays(lastDay, 6 - weekdayOf(lastDay));

  const days: string[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) days.push(day);

  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return { from: gridStart, to: addDays(gridEnd, 1), weeks, monthStart };
}
