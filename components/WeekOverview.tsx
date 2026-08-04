"use client";

import { CATEGORY_COLORS } from "@/lib/categoryColors";
import { toDateKey } from "@/lib/date";
import { TripEvent } from "@/lib/types";

const SIZE = 88;
const CENTER = SIZE / 2;
const FACE_RADIUS = 15;
const RING_START = 21;
const RING_WIDTH = 9;
const ARC_STROKE = 6;
const MIN_ARC_DEGREES = 10;

function angleForHours(hours: number): number {
  return (hours / 24) * 360 - 90;
}

function pointOnCircle(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) };
}

function describeArc(radius: number, startAngleDeg: number, endAngleDeg: number): string {
  const start = pointOnCircle(startAngleDeg, radius);
  const end = pointOnCircle(endAngleDeg, radius);
  let sweep = endAngleDeg - startAngleDeg;
  if (sweep < 0) sweep += 360;
  const largeArcFlag = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

// Same greedy interval-graph coloring as ClockDayView, kept small and local
// here rather than shared — this preview has no drag/resize/hands, just a
// glance-sized rendering of the day's arcs.
function assignRings(items: { id: string; startHours: number; endHours: number }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.startHours - b.startHours);
  const ringEnds: number[] = [];
  const ringOf = new Map<string, number>();
  for (const item of sorted) {
    let placed = false;
    for (let r = 0; r < ringEnds.length; r++) {
      if (ringEnds[r] <= item.startHours) {
        ringEnds[r] = item.endHours;
        ringOf.set(item.id, r);
        placed = true;
        break;
      }
    }
    if (!placed) {
      ringEnds.push(item.endHours);
      ringOf.set(item.id, ringEnds.length - 1);
    }
  }
  return ringOf;
}

interface WeekOverviewProps {
  weekStart: Date;
  events: TripEvent[];
  onSelectDay: (date: Date) => void;
}

export function WeekOverview({ weekStart, events, onSelectDay }: WeekOverviewProps) {
  const days = Array.from(
    { length: 7 },
    (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
  );

  return (
    <div className="week-overview">
      {days.map((day) => {
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 3600000);

        const dayEvents = events.filter((e) => {
          const s = new Date(e.start_time);
          const en = new Date(e.end_time);
          return s < dayEnd && en > dayStart;
        });

        const ranges = dayEvents.map((e) => {
          const s = new Date(e.start_time);
          const en = new Date(e.end_time);
          const clampedStart = s < dayStart ? dayStart : s;
          const clampedEnd = en > dayEnd ? dayEnd : en;
          return {
            id: e.id,
            category: e.category,
            startHours: (clampedStart.getTime() - dayStart.getTime()) / 3600000,
            endHours: (clampedEnd.getTime() - dayStart.getTime()) / 3600000,
          };
        });
        const rings = assignRings(ranges);
        const isToday = toDateKey(new Date()) === toDateKey(day);

        return (
          <button
            key={toDateKey(day)}
            type="button"
            className="week-day-cell"
            onClick={() => onSelectDay(day)}
          >
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="week-day-svg">
              <circle
                cx={CENTER}
                cy={CENTER}
                r={FACE_RADIUS}
                fill="var(--panel-2)"
                stroke={isToday ? "var(--accent)" : "var(--border)"}
                strokeWidth={isToday ? 2 : 1}
              />
              {ranges.map((r) => {
                const ring = rings.get(r.id) ?? 0;
                const radius = RING_START + ring * RING_WIDTH;
                const startAngle = angleForHours(r.startHours);
                let endAngle = angleForHours(r.endHours);
                let sweep = endAngle - startAngle;
                if (sweep < 0) sweep += 360;
                if (sweep < MIN_ARC_DEGREES) endAngle = startAngle + MIN_ARC_DEGREES;
                return (
                  <path
                    key={r.id}
                    d={describeArc(radius, startAngle, endAngle)}
                    fill="none"
                    stroke={CATEGORY_COLORS[r.category]}
                    strokeWidth={ARC_STROKE}
                    strokeLinecap="round"
                  />
                );
              })}
              <text
                x={CENTER}
                y={CENTER}
                textAnchor="middle"
                dominantBaseline="middle"
                className="mono"
                style={{ fontSize: 18, fontWeight: 700, fill: "var(--text)" }}
              >
                {day.getDate()}
              </text>
            </svg>
            <span className="week-day-label">
              {day.toLocaleDateString(undefined, { weekday: "short" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
