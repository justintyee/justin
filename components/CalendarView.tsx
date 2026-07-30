"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import {
  DateSelectArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
} from "@fullcalendar/core";
import { useEvents } from "@/context/EventsContext";
import { CATEGORY_COLORS, CATEGORY_TEXT_COLORS } from "@/lib/categoryColors";
import { TripEvent } from "@/lib/types";
import { useIsMobile } from "@/lib/useIsMobile";

interface CalendarViewProps {
  onRequestCreate: (range: { start: Date; end: Date }) => void;
  onRequestEdit: (event: TripEvent) => void;
}

export function CalendarView({ onRequestCreate, onRequestEdit }: CalendarViewProps) {
  const { events, updateEvent } = useEvents();
  const isMobile = useIsMobile();

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

  return (
    <div className="trip-calendar">
      <FullCalendar
        key={isMobile ? "mobile" : "desktop"}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={isMobile ? "listWeek" : "timeGridWeek"}
        views={
          isMobile
            ? {
                // A 7-column week grid can't fit readable event text at
                // phone widths (FullCalendar's horizontal-scroll layout
                // needs a premium ScrollGrid we don't have). A rolling
                // 3-day window gives each column enough room for actual
                // text while still paging through the week via prev/next.
                timeGridThreeDay: {
                  type: "timeGrid",
                  duration: { days: 3 },
                  buttonText: "Week",
                },
              }
            : undefined
        }
        headerToolbar={
          isMobile
            ? {
                left: "prev,next today",
                center: "title",
                right: "listWeek,timeGridDay,timeGridThreeDay",
              }
            : {
                left: "prev,next today",
                center: "title",
                right: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
              }
        }
        titleFormat={isMobile ? { month: "short", day: "numeric" } : undefined}
        allDaySlot={false}
        height="100%"
        selectable
        editable
        eventResizableFromStart
        events={calendarEvents}
        eventClick={handleEventClick}
        select={handleSelect}
        dateClick={handleDateClick}
        eventDrop={persistMove}
        eventResize={persistMove}
        eventContent={renderEventContent}
        nowIndicator
      />
    </div>
  );
}
