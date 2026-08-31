import { WEEKDAYS_SHORT } from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import type { Row } from "./types";

export function MonthGrid({
  weeks,
  monthStart,
  dayMap,
  today,
  onPickDay,
}: {
  weeks: string[][];
  monthStart: string;
  dayMap: Map<string, Row[]>;
  today: string;
  onPickDay: (day: string) => void;
}) {
  const monthPrefix = monthStart.slice(0, 7);
  return (
    <div className="select-none overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS_SHORT.map((wd) => (
          <div
            key={wd}
            className="cursor-default p-2 text-center text-[10px] font-bold uppercase text-muted-foreground"
          >
            {wd}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-7">
          {week.map((day) => {
            const items = dayMap.get(day) ?? [];
            const inMonth = day.slice(0, 7) === monthPrefix;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onPickDay(day)}
                className={`flex min-h-[76px] cursor-pointer flex-col items-start gap-1 border-b border-r p-1.5 text-left outline-none last:border-r-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring ${
                  inMonth ? "" : "text-muted-foreground/50"
                } ${day === today ? "bg-primary/5" : ""}`}
              >
                <span className="text-xs font-bold">{Number(day.slice(8, 10))}</span>
                {items.length > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-0 bg-primary/10 px-1.5 py-0 text-[10px] font-semibold text-primary"
                  >
                    {items.length} agend.
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
