"use client";

import { CATEGORY_COLORS } from "@/lib/categoryColors";
import { TripEvent } from "@/lib/types";

interface EventListProps {
  events: TripEvent[];
  selectedId?: string | null;
  onSelect: (event: TripEvent) => void;
}

export function EventList({ events, selectedId = null, onSelect }: EventListProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  if (sorted.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
        No activities in this category yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 overflow-y-auto">
      {sorted.map((event) => {
        const isSelected = event.id === selectedId;
        return (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => onSelect(event)}
              className="entry"
              style={
                isSelected
                  ? { borderColor: "var(--accent)", background: "var(--hover)" }
                  : undefined
              }
            >
              <span
                className="edot"
                style={{ backgroundColor: CATEGORY_COLORS[event.category] }}
              />
              <span className="min-w-0 flex-1">
                <span className="etitle">{event.title}</span>
                <span className="esub">
                  {event.place_name ?? event.address ?? "No location set"}
                </span>
              </span>
              <span className="etime mono">
                {new Date(event.start_time).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
