"use client";

import { useEffect, useRef, useState } from "react";
import { useEvents } from "@/context/EventsContext";
import { CATEGORY_COLORS } from "@/lib/categoryColors";
import { TripEvent } from "@/lib/types";

interface EventListProps {
  events: TripEvent[];
  selectedId?: string | null;
  onSelect: (event: TripEvent) => void;
}

const CONFIRM_TIMEOUT_MS = 3000;

export function EventList({ events, selectedId = null, onSelect }: EventListProps) {
  const { deleteEvent } = useEvents();
  // A native `confirm()` would be a jarring, un-themed browser dialog in an
  // otherwise fully custom UI, so a stray tap is guarded with an inline
  // arm/confirm step on the button itself instead, which auto-disarms after
  // a few seconds so it never lingers as a trap for a later, unrelated tap.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  useEffect(() => {
    return () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  if (sorted.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
        No activities in this category yet.
      </p>
    );
  }

  function handleDeleteClick(event: TripEvent) {
    if (revertTimer.current) clearTimeout(revertTimer.current);

    if (confirmingId !== event.id) {
      setConfirmingId(event.id);
      revertTimer.current = setTimeout(() => setConfirmingId(null), CONFIRM_TIMEOUT_MS);
      return;
    }
    setConfirmingId(null);
    deleteEvent(event.id).catch(() => {
      // Optimistic removal already rolled back by the context on error.
    });
  }

  return (
    <ul className="flex flex-col gap-2 overflow-y-auto">
      {sorted.map((event) => {
        const isSelected = event.id === selectedId;
        const isConfirming = confirmingId === event.id;
        return (
          <li key={event.id}>
            <div
              className="entry"
              style={
                isSelected
                  ? { borderColor: "var(--accent)", background: "var(--hover)" }
                  : undefined
              }
            >
              <button type="button" onClick={() => onSelect(event)} className="entry-main">
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
              <button
                type="button"
                onClick={() => handleDeleteClick(event)}
                className={`ghost-btn icon-btn entry-delete${isConfirming ? " confirming" : ""}`}
                aria-label={isConfirming ? `Confirm delete ${event.title}` : `Delete ${event.title}`}
                title={isConfirming ? "Click again to delete" : "Delete"}
              >
                {isConfirming ? "Delete?" : <>&#x2715;</>}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
