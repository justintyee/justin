"use client";

import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
} from "@fullcalendar/core";
import { useEvents } from "@/context/EventsContext";
import { CATEGORY_COLORS, CATEGORY_TEXT_COLORS } from "@/lib/categoryColors";
import { TripEvent } from "@/lib/types";
import { useIsMobile } from "@/lib/useIsMobile";
import { ClockDayView } from "@/components/ClockDayView";
import { WeekOverview } from "@/components/WeekOverview";

interface CalendarViewProps {
  onRequestCreate: (range: { start: Date; end: Date }) => void;
  onRequestEdit: (event: TripEvent) => void;
}

type ViewKey = "day" | "week" | "month" | "list";

function fullCalendarViewName(view: Exclude<ViewKey, "day" | "week">): string {
  switch (view) {
    case "month":
      return "dayGridMonth";
    case "list":
      return "listWeek";
  }
}

function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay()); // getDay(): 0 = Sunday
  return start;
}

function shiftDate(date: Date, view: ViewKey, direction: 1 | -1): Date {
  const next = new Date(date);
  if (view === "day") {
    next.setDate(next.getDate() + direction);
  } else if (view === "month") {
    next.setMonth(next.getMonth() + direction);
  } else {
    next.setDate(next.getDate() + direction * 7);
  }
  return next;
}

function formatDayTitle(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeekTitle(weekStart: Date): string {
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 3600000);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const startStr = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endStr = weekEnd.toLocaleDateString(
    undefined,
    sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" }
  );
  return `${startStr} – ${endStr}, ${weekEnd.getFullYear()}`;
}

export function CalendarView({ onRequestCreate, onRequestEdit }: CalendarViewProps) {
  const { events, updateEvent } = useEvents();
  const isMobile = useIsMobile();
  const calendarRef = useRef<FullCalendar>(null);
  const [view, setView] = useState<ViewKey>("week");
  // Deferred to an effect (not a lazy useState initializer) so the initial
  // `new Date()` call never runs synchronously during render — see the
  // matching `now` pattern in ClockDayView.
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [viewTitle, setViewTitle] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setCurrentDate(new Date()), 0);
    return () => clearTimeout(timeout);
  }, []);

  // Keep the FullCalendar instance in sync with our own toolbar state,
  // since headerToolbar is disabled and navigation is fully custom. Day and
  // Week are rendered by our own components instead, so FullCalendar only
  // needs syncing for Month/List.
  //
  // Switching to Month/List from Day/Week mounts a brand-new FullCalendar
  // instance in this same commit. Calling its imperative API synchronously
  // here — same tick as that mount — collides with FullCalendar's own
  // internal flushSync and triggers a "flushSync called from inside a
  // lifecycle method" warning. Deferring one frame lets that mount settle
  // first.
  useEffect(() => {
    if (view === "day" || view === "week" || !currentDate) return;
    const id = requestAnimationFrame(() => {
      const api = calendarRef.current?.getApi();
      if (!api) return;
      const targetView = fullCalendarViewName(view);
      if (api.view.type !== targetView) {
        api.changeView(targetView);
      }
      api.gotoDate(currentDate);
    });
    return () => cancelAnimationFrame(id);
  }, [view, currentDate]);

  if (!currentDate) return null;

  const calendarEvents = events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    backgroundColor: CATEGORY_COLORS[event.category],
    borderColor: CATEGORY_COLORS[event.category],
    textColor: CATEGORY_TEXT_COLORS[event.category],
  }));

  function handleEventClick(arg: EventClickArg) {
    const event = events.find((e) => e.id === arg.event.id);
    if (event) onRequestEdit(event);
  }

  function handleSelect(arg: DateSelectArg) {
    onRequestCreate({ start: arg.start, end: arg.end });
  }

  // A drag-select is awkward on touch (needs a long-press), so a plain
  // tap/click on a date or time cell also opens the create form directly,
  // defaulting to a 1-hour slot starting there.
  function handleDateClick(arg: DateClickArg) {
    const start = arg.date;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    onRequestCreate({ start, end });
  }

  function handleDatesSet(arg: DatesSetArg) {
    setViewTitle(arg.view.title);
  }

  async function persistMove(arg: EventDropArg | EventResizeDoneArg) {
    const { event, revert } = arg;
    if (!event.start || !event.end) {
      revert();
      return;
    }
    try {
      await updateEvent(event.id, {
        start_time: event.start.toISOString(),
        end_time: event.end.toISOString(),
      });
    } catch {
      revert();
    }
  }

  function renderEventContent(arg: EventContentArg) {
    // List view has plenty of horizontal room and should show the full
    // title; only the narrow day/week/timegrid blocks need truncation.
    const isListView = arg.view.type.startsWith("list");
    // arg.textColor is chosen for contrast against the event's own colored
    // background (day/week/timegrid blocks). List view rows use the plain
    // theme background instead, so that color can turn invisible there
    // (e.g. white-on-white in light mode) — use the normal theme text
    // color for list rows instead.
    return (
      <div
        className={`px-1 text-xs font-semibold ${isListView ? "" : "truncate"}`}
        style={{
          color: isListView ? "var(--text)" : arg.textColor,
          whiteSpace: isListView ? "normal" : undefined,
        }}
      >
        {arg.timeText && <span className="mono mr-1 opacity-85">{arg.timeText}</span>}
        {arg.event.title}
      </div>
    );
  }

  function goPrev() {
    setCurrentDate((d) => shiftDate(d ?? new Date(), view, -1));
  }

  function goNext() {
    setCurrentDate((d) => shiftDate(d ?? new Date(), view, 1));
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  function goToDay(day: Date) {
    setCurrentDate(day);
    setView("day");
  }

  const viewButtons: { key: ViewKey; label: string }[] = [
    { key: "day", label: "Day" },
    { key: "week", label: "Week" },
    ...(isMobile ? [] : [{ key: "month" as const, label: "Month" }]),
    { key: "list", label: "List" },
  ];

  return (
    <div className="trip-calendar flex h-full flex-col">
      <div className="calendar-toolbar">
        <div className="calendar-toolbar-nav">
          <button type="button" className="ghost-btn icon-btn" onClick={goPrev} aria-label="Previous">
            ‹
          </button>
          <button type="button" className="ghost-btn" onClick={goToday}>
            Today
          </button>
          <button type="button" className="ghost-btn icon-btn" onClick={goNext} aria-label="Next">
            ›
          </button>
        </div>
        <span className="calendar-toolbar-title mono">
          {view === "day"
            ? formatDayTitle(currentDate)
            : view === "week"
              ? formatWeekTitle(startOfWeek(currentDate))
              : viewTitle}
        </span>
        <div className="calendar-toolbar-views">
          {viewButtons.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`ghost-btn${view === b.key ? " active" : ""}`}
              onClick={() => setView(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {view === "day" ? (
          <ClockDayView
            date={currentDate}
            events={events}
            onRequestCreate={onRequestCreate}
            onRequestEdit={onRequestEdit}
            onUpdateEvent={updateEvent}
          />
        ) : view === "week" ? (
          <WeekOverview weekStart={startOfWeek(currentDate)} events={events} onSelectDay={goToDay} />
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
            initialView={fullCalendarViewName(view)}
            initialDate={currentDate}
            headerToolbar={false}
            height="100%"
            selectable
            editable
            eventResizableFromStart
            events={calendarEvents}
            eventClick={handleEventClick}
            select={handleSelect}
            dateClick={handleDateClick}
            datesSet={handleDatesSet}
            eventDrop={persistMove}
            eventResize={persistMove}
            eventContent={renderEventContent}
          />
        )}
      </div>
    </div>
  );
}
