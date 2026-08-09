"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { EventsProvider, useEvents } from "@/context/EventsContext";
import { FilterProvider, useFilter } from "@/context/FilterContext";
import { CalendarView } from "@/components/CalendarView";
import { CategoryFilterBar } from "@/components/CategoryFilterBar";
import { EventList } from "@/components/EventList";
import { EventFormModal } from "@/components/EventFormModal";
import { MobileTabSwitcher, MobileTab } from "@/components/MobileTabSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatDateLabel, toDateKey } from "@/lib/date";
import { TripEvent } from "@/lib/types";

// Leaflet touches `window` at import time, so the map must never render
// during server-side rendering.
const MapPanel = dynamic(() => import("@/components/MapPanel").then((m) => m.MapPanel), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center text-sm"
      style={{ color: "var(--muted)" }}
    >
      Loading map...
    </div>
  ),
});

type ModalState =
  | { mode: "create"; range: { start: Date; end: Date } }
  | { mode: "edit"; event: TripEvent }
  | null;

const DEFAULT_SIDEBAR_WIDTH = 380;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 640;
const SIDEBAR_WIDTH_STORAGE_KEY = "sidebarWidth";

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function TripClient({ tripId, tripName }: { tripId: string; tripName: string }) {
  return (
    <EventsProvider tripId={tripId}>
      <FilterProvider>
        <TripLayout tripId={tripId} tripName={tripName} />
      </FilterProvider>
    </EventsProvider>
  );
}

function TripLayout({ tripId, tripName }: { tripId: string; tripName: string }) {
  const { events } = useEvents();
  const { isVisible } = useFilter();
  const [modal, setModal] = useState<ModalState>(null);
  const [selectedEvent, setSelectedEvent] = useState<TripEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("calendar");
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  // Guards the persist effect below from firing with the default width
  // before the stored width has even been read — otherwise that first,
  // pre-load write clobbers whatever was saved from a previous visit.
  const hasLoadedWidthRef = useRef(false);

  // Deferred one tick (not read synchronously in a lazy useState
  // initializer, nor set synchronously in the effect body) since this
  // component renders during SSR — no localStorage there — and must
  // match on the client's first render too. See the matching `now`
  // pattern in ClockDayView.
  useEffect(() => {
    const timeout = setTimeout(() => {
      const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      const parsed = stored ? Number(stored) : NaN;
      if (!Number.isNaN(parsed)) setSidebarWidth(clampSidebarWidth(parsed));
      hasLoadedWidthRef.current = true;
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;

    function handleMove(e: PointerEvent) {
      const main = mainRef.current;
      if (!main) return;
      const rect = main.getBoundingClientRect();
      // Sidebar hugs the right edge, so its width is just the distance
      // from the pointer back to that edge.
      setSidebarWidth(clampSidebarWidth(rect.right - e.clientX));
    }
    function handleUp() {
      setIsResizingSidebar(false);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (!hasLoadedWidthRef.current) return;
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  function handleSaved(info: { title: string; geocodeFailed: boolean }) {
    if (!info.geocodeFailed) return;
    setToast(
      `"${info.title}" saved, but we couldn't find that address on the map. Try a shorter address or pick a suggestion from the dropdown.`
    );
    setTimeout(() => setToast(null), 6000);
  }

  const focusEvent = modal?.mode === "edit" ? modal.event : selectedEvent;

  const availableDates = useMemo(() => {
    const keys = new Set(events.map((e) => toDateKey(new Date(e.start_time))));
    return Array.from(keys).sort();
  }, [events]);

  // Steps through the same list of dates the dropdown offers (only days
  // that actually have activities) rather than the raw calendar, so the
  // arrows never land on an empty day with nothing to show on the map.
  function shiftSelectedDate(direction: 1 | -1) {
    if (availableDates.length === 0) return;
    const currentIndex = selectedDate ? availableDates.indexOf(selectedDate) : -1;
    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = direction === 1 ? 0 : availableDates.length - 1;
    } else {
      nextIndex = Math.max(0, Math.min(availableDates.length - 1, currentIndex + direction));
    }
    setSelectedDate(availableDates[nextIndex]);
  }

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          isVisible(e.category) &&
          (selectedDate === null || toDateKey(new Date(e.start_time)) === selectedDate)
      ),
    [events, isVisible, selectedDate]
  );

  const sidePanel = (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
      <div
        className="card flex h-[45vh] shrink-0 flex-col lg:h-1/2"
        style={{ padding: 0, overflow: "hidden" }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="card-title" style={{ margin: 0 }}>
            Map
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="ghost-btn icon-btn"
              onClick={() => shiftSelectedDate(-1)}
              disabled={availableDates.length === 0}
              aria-label="Previous day"
            >
              ‹
            </button>
            <select
              value={selectedDate ?? ""}
              onChange={(e) => setSelectedDate(e.target.value || null)}
              className="date-nav-select"
              style={{
                background: "var(--bg)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                fontSize: "12px",
              }}
            >
              <option value="">All dates</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {formatDateLabel(d)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ghost-btn icon-btn"
              onClick={() => shiftSelectedDate(1)}
              disabled={availableDates.length === 0}
              aria-label="Next day"
            >
              ›
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <MapPanel
            events={filteredEvents}
            onMarkerClick={(event) => setModal({ mode: "edit", event })}
            focusEvent={focusEvent}
          />
        </div>
      </div>
      <div className="card flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
        <span className="card-title">Activities</span>
        <CategoryFilterBar />
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <EventList
            events={filteredEvents}
            selectedId={selectedEvent?.id ?? null}
            onSelect={(event) => setSelectedEvent(event)}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="app-header shrink-0 flex-wrap justify-between gap-3">
        <h1>{tripName}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() =>
              setModal({
                mode: "create",
                range: { start: new Date(), end: new Date(Date.now() + 60 * 60 * 1000) },
              })
            }
            className="primary-btn"
          >
            New entry
          </button>
        </div>
      </header>

      <div className="shrink-0 px-4 py-2 lg:hidden" style={{ borderBottom: "1px solid var(--border)" }}>
        <MobileTabSwitcher active={mobileTab} onChange={setMobileTab} />
      </div>

      <main
        ref={mainRef}
        className="min-h-0 flex-1 gap-4 p-4 lg:grid"
        style={{ gridTemplateColumns: `1fr 12px ${sidebarWidth}px` }}
      >
        <div className={`h-full min-h-0 ${mobileTab === "calendar" ? "block" : "hidden"} lg:block`}>
          <CalendarView
            onRequestCreate={(range) => setModal({ mode: "create", range })}
            onRequestEdit={(event) => setModal({ mode: "edit", event })}
          />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          className="resize-divider hidden lg:block"
          onPointerDown={(e) => {
            e.preventDefault();
            setIsResizingSidebar(true);
          }}
        >
          <div className={`resize-divider-line${isResizingSidebar ? " active" : ""}`} />
        </div>
        <div
          className={`${mobileTab === "map" ? "block" : "hidden"} lg:block lg:h-full lg:min-h-0`}
        >
          {sidePanel}
        </div>
      </main>

      {modal?.mode === "create" && (
        <EventFormModal
          tripId={tripId}
          mode="create"
          initialRange={modal.range}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {modal?.mode === "edit" && (
        <EventFormModal
          tripId={tripId}
          mode="edit"
          initialEvent={modal.event}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {toast && (
        <div
          className="card fixed right-4 bottom-4 max-w-sm text-sm"
          style={{ zIndex: 2000 }}
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
