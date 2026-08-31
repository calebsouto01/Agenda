import { WEEKDAYS_SHORT, timeInZone, weekdayOf } from "@/lib/booking";
import { isHourAvailable } from "./utils";
import { STATUS_CHIP, type BusinessHour, type Row } from "./types";

export function WeekGrid({
  days,
  hours,
  cellMap,
  today,
  tz,
  hoursByWeekday,
  onSelect,
}: {
  days: string[];
  hours: number[];
  cellMap: Map<string, Row[]>;
  today: string;
  tz: string;
  hoursByWeekday: Map<number, BusinessHour>;
  onSelect: (a: Row) => void;
}) {
  return (
    <div className="select-none overflow-x-auto rounded-xl border bg-card">
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}
      >
        <div className="sticky left-0 z-10 border-b border-r bg-card" />
        {days.map((day) => {
          const dayHours = hoursByWeekday.get(weekdayOf(day));
          const closed = !dayHours || dayHours.closed;
          return (
            <div
              key={day}
              className={`cursor-default border-b border-r p-2 text-center last:border-r-0 ${
                closed ? "bg-muted/30" : day === today ? "bg-primary/5" : ""
              }`}
            >
              <p className="text-[10px] font-bold uppercase text-muted-foreground">
                {WEEKDAYS_SHORT[weekdayOf(day)]}
              </p>
              <p className="text-sm font-bold">{Number(day.slice(8, 10))}</p>
              {closed ? (
                <p className="text-[9px] font-semibold text-muted-foreground">Fechado</p>
              ) : null}
            </div>
          );
        })}

        {hours.map((hour) => (
          <HourRow
            key={hour}
            hour={hour}
            days={days}
            cellMap={cellMap}
            today={today}
            tz={tz}
            hoursByWeekday={hoursByWeekday}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function HourRow({
  hour,
  days,
  cellMap,
  today,
  tz,
  hoursByWeekday,
  onSelect,
}: {
  hour: number;
  days: string[];
  cellMap: Map<string, Row[]>;
  today: string;
  tz: string;
  hoursByWeekday: Map<number, BusinessHour>;
  onSelect: (a: Row) => void;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 border-b border-r bg-card px-1 py-2 text-right text-[10px] font-semibold text-muted-foreground">
        {String(hour).padStart(2, "0")}:00
      </div>
      {days.map((day) => {
        const items = cellMap.get(`${day}-${hour}`) ?? [];
        const available = isHourAvailable(hoursByWeekday.get(weekdayOf(day)), hour);
        return (
          <div
            key={day}
            className={`min-h-[52px] cursor-default border-b border-r p-1 last:border-r-0 ${
              available ? (day === today ? "bg-primary/5" : "") : "bg-muted/20"
            }`}
          >
            {items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a)}
                className={`mb-1 block w-full cursor-pointer truncate rounded-md px-1.5 py-1 text-left text-[10px] font-semibold outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring ${STATUS_CHIP[a.status]}`}
              >
                {timeInZone(a.starts_at, tz)} {a.customers?.name}
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}
