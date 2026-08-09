"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_COLORS, CATEGORY_TEXT_COLORS } from "@/lib/categoryColors";
import { toDateKey } from "@/lib/date";
import { TripEvent } from "@/lib/types";
import { useIsMobile } from "@/lib/useIsMobile";

// The SVG viewBox itself stays a fixed size at every breakpoint (the
// element's on-screen pixel size is purely a CSS concern) — only the
// internal proportions below vary between mobile/desktop, computed inside
// the component from `useIsMobile()`.
const SIZE = 500;
const CENTER = SIZE / 2;
const MIN_ARC_DEGREES = 5;
const MIN_DURATION_MIN = 15;
const DRAG_THRESHOLD_PX = 6; // movement below this still counts as a tap
const CREATE_SNAP_HOURS = 0.25; // 15 minutes
const PILL_MAX_CHARS = 22;

interface ClockDayViewProps {
  date: Date;
  events: TripEvent[];
  onRequestCreate: (range: { start: Date; end: Date }) => void;
  onRequestEdit: (event: TripEvent) => void;
  onUpdateEvent: (id: string, patch: { start_time: string; end_time: string }) => Promise<void>;
}

// The dial only spans [DAY_VIEW_START_HOUR, 24) instead of the full day —
// dropping the early-morning hours (when nothing's usually scheduled) means
// the remaining hours each get a bigger share of the 360°, so afternoon/
// evening activity arcs draw noticeably larger.
const DAY_VIEW_START_HOUR = 9;
const DAY_VIEW_HOURS = 24 - DAY_VIEW_START_HOUR;

// `hours` here is hours-since-dayStart (i.e. since DAY_VIEW_START_HOUR),
// not hours-since-midnight.
function angleForHours(hours: number): number {
  return (hours / DAY_VIEW_HOURS) * 360 - 90;
}

function hoursForAngle(angleDeg: number): number {
  let hours = ((angleDeg + 90) / 360) * DAY_VIEW_HOURS;
  hours = hours % DAY_VIEW_HOURS;
  if (hours < 0) hours += DAY_VIEW_HOURS;
  return hours;
}

// Angle for a clock hand, given its current value (e.g. minutes) and the
// value it takes to complete a full revolution (e.g. 60).
function analogAngle(value: number, max: number): number {
  return (value / max) * 360 - 90;
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

// Hours-since-dayStart for the given date's local start/end, clamped to
// [0, DAY_VIEW_HOURS] so events don't draw outside the ring or wrap around
// oddly when they start before or run past the viewed window.
function clampedHourRange(
  startIso: string,
  endIso: string,
  dayStart: Date,
  dayEnd: Date
): { startHours: number; endHours: number } {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const clampedStart = start < dayStart ? dayStart : start;
  const clampedEnd = end > dayEnd ? dayEnd : end;
  const startHours = (clampedStart.getTime() - dayStart.getTime()) / 3600000;
  const endHours = (clampedEnd.getTime() - dayStart.getTime()) / 3600000;
  return { startHours, endHours };
}

// Greedy interval-graph coloring: events that overlap in time land on
// different concentric rings instead of drawing on top of each other.
function assignRings(
  items: { id: string; startHours: number; endHours: number }[]
): Map<string, number> {
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

const HOUR_LABELS = [10, 12, 14, 16, 18, 20, 22].map((absoluteHour) => ({
  hours: absoluteHour - DAY_VIEW_START_HOUR,
  label:
    absoluteHour === 12 ? "12p" : absoluteHour < 12 ? `${absoluteHour}a` : `${absoluteHour - 12}p`,
}));

// Sized to fit the (possibly truncated) title text, independent of the
// arc's own angular length — this is what lets a 1-2hr event's label show
// in full instead of being clipped to whatever fits along a short arc.
function pillTitle(title: string): string {
  if (title.length <= PILL_MAX_CHARS) return title;
  return title.slice(0, PILL_MAX_CHARS - 1) + "…";
}

function pillWidth(title: string, charPx: number, padX: number): number {
  return pillTitle(title).length * charPx + padX * 2;
}

// A label rotated to follow its radial tangent reads upside-down across half
// the clock face; flip it 180° there so text always stays right-side up.
function uprightRotation(angleDeg: number): number {
  let rot = ((angleDeg + 90) % 360 + 360) % 360;
  if (rot > 90 && rot < 270) rot -= 180;
  return rot;
}

type DragMode = "move" | "resize-start" | "resize-end";

interface DragState {
  event: TripEvent;
  mode: DragMode;
  pointerId: number;
  originalStart: Date;
  originalEnd: Date;
  startPointerHours: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

interface CreateDragState {
  pointerId: number;
  anchorHours: number;
  currentHours: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

export function ClockDayView({
  date,
  events,
  onRequestCreate,
  onRequestEdit,
  onUpdateEvent,
}: ClockDayViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [previewOverride, setPreviewOverride] = useState<{ id: string; start: Date; end: Date } | null>(
    null
  );
  const [createDrag, setCreateDrag] = useState<CreateDragState | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  // A smaller analog face leaves much more radius for the activity ring,
  // so arcs and their pill labels can be drawn noticeably thicker on a
  // phone screen instead of just shrinking everything uniformly.
  const isMobile = useIsMobile();
  const FACE_RADIUS = isMobile ? 100 : 140;
  const HOUR_HAND_LENGTH = isMobile ? 40 : 55;
  const MINUTE_HAND_LENGTH = isMobile ? 65 : 90;
  const SECOND_HAND_LENGTH = isMobile ? 76 : 105;
  const CENTER_PIVOT_RADIUS = isMobile ? 5 : 6;
  const LABEL_RADIUS = isMobile ? 84 : 118; // hour numbers sit inside the face, near its rim
  const LABEL_FONT_SIZE_HOURS = isMobile ? 17 : 20;
  const TICK_INNER = isMobile ? 106 : 145;
  const TICK_OUTER = isMobile ? 114 : 154;
  const RING_START = isMobile ? 128 : 168;
  const RING_WIDTH = isMobile ? 46 : 30; // includes gap
  const ARC_STROKE = isMobile ? 38 : 24;
  const HANDLE_HIT_RADIUS = isMobile ? 30 : 26; // generous touch target
  const CREATE_PREVIEW_RADIUS = isMobile ? 121 : 161; // between the hour ticks and the first event ring
  // Pill-shaped activity labels: sized to fit the full title rather than the
  // arc's own angular length, so short (1-2hr) events don't get their label
  // truncated — a fixed rect+text pair rides alongside the arc instead of
  // curved text bent along it.
  const PILL_HEIGHT = isMobile ? 42 : 27;
  const PILL_PAD_X = isMobile ? 12 : 10;
  const PILL_CHAR_PX = isMobile ? 9.8 : 7.2;
  const PILL_FONT_SIZE = isMobile ? 18 : 12;

  useEffect(() => {
    const tick = () => setNow(new Date());
    // Defer the initial tick instead of calling setState synchronously in
    // the effect body (react-hooks/set-state-in-effect); a 0ms timeout still
    // resolves on the next task, so the "now" indicator shows up immediately.
    const timeout = setTimeout(tick, 0);
    // Ticks every second so the analog second hand actually sweeps, rather
    // than jumping once a minute.
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(id);
    };
  }, []);

  const dayStart = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), date.getDate(), DAY_VIEW_START_HOUR, 0, 0),
    [date]
  );
  const dayEnd = useMemo(() => new Date(dayStart.getTime() + DAY_VIEW_HOURS * 3600000), [dayStart]);

  const isToday = now !== null && toDateKey(now) === toDateKey(date);

  const dayEvents = useMemo(
    () =>
      events.filter((e) => {
        const start = new Date(e.start_time);
        const end = new Date(e.end_time);
        return start < dayEnd && end > dayStart;
      }),
    [events, dayStart, dayEnd]
  );

  const ranges = useMemo(() => {
    const map = new Map<string, { startHours: number; endHours: number }>();
    for (const event of dayEvents) {
      if (previewOverride && previewOverride.id === event.id) {
        map.set(
          event.id,
          clampedHourRange(
            previewOverride.start.toISOString(),
            previewOverride.end.toISOString(),
            dayStart,
            dayEnd
          )
        );
      } else {
        map.set(event.id, clampedHourRange(event.start_time, event.end_time, dayStart, dayEnd));
      }
    }
    return map;
  }, [dayEvents, dayStart, dayEnd, previewOverride]);

  const rings = useMemo(
    () =>
      assignRings(
        dayEvents.map((e) => ({ id: e.id, ...(ranges.get(e.id) ?? { startHours: 0, endHours: 0 }) }))
      ),
    [dayEvents, ranges]
  );

  function pointerToHours(clientX: number, clientY: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const x = (clientX - rect.left) * scale;
    const y = (clientY - rect.top) * scale;
    const angle = (Math.atan2(y - CENTER, x - CENTER) * 180) / Math.PI;
    return hoursForAngle(angle);
  }

  // Mirrors `previewOverride` for reads inside the pointerup handler. Event
  // handlers may run interleaved with React's own scheduling, so pulling the
  // latest preview via setState's functional updater would call
  // onUpdateEvent (which dispatches into EventsContext) from inside a
  // "pure" state-updater callback — React flags that as updating one
  // component while rendering another. A ref sidesteps it: both the write
  // (handleMove) and the read (handleUp) happen in real event handlers,
  // never during render.
  const previewRef = useRef<{ id: string; start: Date; end: Date } | null>(null);

  function setPreview(next: { id: string; start: Date; end: Date } | null) {
    previewRef.current = next;
    setPreviewOverride(next);
  }

  function beginDrag(
    event: TripEvent,
    mode: DragMode,
    pointerId: number,
    clientX: number,
    clientY: number
  ) {
    setDrag({
      event,
      mode,
      pointerId,
      originalStart: new Date(event.start_time),
      originalEnd: new Date(event.end_time),
      startPointerHours: pointerToHours(clientX, clientY),
      startClientX: clientX,
      startClientY: clientY,
      moved: false,
    });
  }

  useEffect(() => {
    if (!drag) return;

    function handleMove(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;
      const movedEnough = drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
      if (movedEnough && !drag.moved) {
        setDrag({ ...drag, moved: true });
      }
      if (!movedEnough) return;

      const hours = pointerToHours(e.clientX, e.clientY);

      if (drag.mode === "move") {
        let deltaHours = hours - drag.startPointerHours;
        // Moving across the dial's start/end seam should still feel continuous.
        if (deltaHours > DAY_VIEW_HOURS / 2) deltaHours -= DAY_VIEW_HOURS;
        if (deltaHours < -DAY_VIEW_HOURS / 2) deltaHours += DAY_VIEW_HOURS;
        const newStart = new Date(drag.originalStart.getTime() + deltaHours * 3600000);
        const newEnd = new Date(drag.originalEnd.getTime() + deltaHours * 3600000);
        setPreview({ id: drag.event.id, start: newStart, end: newEnd });
      } else if (drag.mode === "resize-end") {
        const candidate = new Date(dayStart.getTime() + hours * 3600000);
        const minEnd = new Date(drag.originalStart.getTime() + MIN_DURATION_MIN * 60000);
        const newEnd = candidate > minEnd ? candidate : minEnd;
        setPreview({ id: drag.event.id, start: drag.originalStart, end: newEnd });
      } else {
        const candidate = new Date(dayStart.getTime() + hours * 3600000);
        const maxStart = new Date(drag.originalEnd.getTime() - MIN_DURATION_MIN * 60000);
        const newStart = candidate < maxStart ? candidate : maxStart;
        setPreview({ id: drag.event.id, start: newStart, end: drag.originalEnd });
      }
    }

    function handleUp(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return;

      if (!drag.moved) {
        // A press with no meaningful movement is a tap: open the editor.
        onRequestEdit(drag.event);
        setDrag(null);
        setPreview(null);
        return;
      }

      const current = previewRef.current;
      if (current && current.id === drag.event.id) {
        // EventsContext reverts + rethrows on failure; the `events` prop
        // will reflect the rollback on the next render, so there's nothing
        // further to do here besides not leaving a rejection unhandled.
        onUpdateEvent(drag.event.id, {
          start_time: current.start.toISOString(),
          end_time: current.end.toISOString(),
        }).catch(() => {});
      }
      setPreview(null);
      setDrag(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, dayStart, onRequestEdit, onUpdateEvent]);

  function handleBackgroundPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const target = e.target as SVGElement;
    if (target.closest("[data-event-hit]") || target.closest("[data-handle-hit]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const hours = pointerToHours(e.clientX, e.clientY);
    setCreateDrag({
      pointerId: e.pointerId,
      anchorHours: hours,
      currentHours: hours,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    });
  }

  useEffect(() => {
    if (!createDrag) return;

    function handleMove(e: PointerEvent) {
      if (!createDrag || e.pointerId !== createDrag.pointerId) return;
      const dx = e.clientX - createDrag.startClientX;
      const dy = e.clientY - createDrag.startClientY;
      const movedEnough = createDrag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
      const hours = pointerToHours(e.clientX, e.clientY);
      setCreateDrag({ ...createDrag, currentHours: hours, moved: movedEnough });
    }

    function handleUp(e: PointerEvent) {
      if (!createDrag || e.pointerId !== createDrag.pointerId) return;

      if (!createDrag.moved) {
        // A tap with no meaningful drag: default to a 1-hour activity
        // starting at the tapped time, snapped to the nearest half hour.
        const rounded = Math.round(createDrag.anchorHours * 2) / 2;
        const start = new Date(dayStart.getTime() + rounded * 3600000);
        const end = new Date(start.getTime() + 60 * 60000);
        onRequestCreate({ start, end });
        setCreateDrag(null);
        return;
      }

      let delta = createDrag.currentHours - createDrag.anchorHours;
      // Dragging across the dial's start/end seam should still feel continuous.
      if (delta > DAY_VIEW_HOURS / 2) delta -= DAY_VIEW_HOURS;
      if (delta < -DAY_VIEW_HOURS / 2) delta += DAY_VIEW_HOURS;
      const otherHours = createDrag.anchorHours + delta;
      const lowHours = Math.round(Math.min(createDrag.anchorHours, otherHours) / CREATE_SNAP_HOURS) * CREATE_SNAP_HOURS;
      const highHours = Math.round(Math.max(createDrag.anchorHours, otherHours) / CREATE_SNAP_HOURS) * CREATE_SNAP_HOURS;
      const start = new Date(dayStart.getTime() + lowHours * 3600000);
      const minEnd = new Date(start.getTime() + MIN_DURATION_MIN * 60000);
      const endCandidate = new Date(dayStart.getTime() + highHours * 3600000);
      const end = endCandidate > minEnd ? endCandidate : minEnd;
      onRequestCreate({ start, end });
      setCreateDrag(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [createDrag, dayStart, onRequestCreate]);

  const createPreviewRange = useMemo(() => {
    if (!createDrag || !createDrag.moved) return null;
    let delta = createDrag.currentHours - createDrag.anchorHours;
    if (delta > DAY_VIEW_HOURS / 2) delta -= DAY_VIEW_HOURS;
    if (delta < -DAY_VIEW_HOURS / 2) delta += DAY_VIEW_HOURS;
    const otherHours = createDrag.anchorHours + delta;
    const startHours = Math.max(0, Math.min(DAY_VIEW_HOURS, Math.min(createDrag.anchorHours, otherHours)));
    const endHours = Math.max(0, Math.min(DAY_VIEW_HOURS, Math.max(createDrag.anchorHours, otherHours)));
    return { startHours, endHours };
  }, [createDrag]);

  // Hidden before DAY_VIEW_START_HOUR: that stretch of the day isn't drawn
  // on this dial at all, so there's no angle to point the indicator at.
  const nowAbsoluteHours = now ? now.getHours() + now.getMinutes() / 60 : null;
  const nowAngle =
    isToday && nowAbsoluteHours !== null && nowAbsoluteHours >= DAY_VIEW_START_HOUR
      ? angleForHours(nowAbsoluteHours - DAY_VIEW_START_HOUR)
      : null;

  const hourAngle = now
    ? analogAngle((now.getHours() % 12) + now.getMinutes() / 60 + now.getSeconds() / 3600, 12)
    : null;
  const minuteAngle = now ? analogAngle(now.getMinutes() + now.getSeconds() / 60, 60) : null;
  const secondAngle = now ? analogAngle(now.getSeconds(), 60) : null;

  return (
    <div className="clock-day-view">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="clock-day-svg"
        onPointerDown={handleBackgroundPointerDown}
        style={{ touchAction: "none" }}
      >
        {/* face */}
        <circle cx={CENTER} cy={CENTER} r={FACE_RADIUS} fill="var(--panel-2)" stroke="var(--border)" strokeWidth={1.5} />

        {/* analog hour/minute/second hands — a real ticking clock */}
        {hourAngle !== null && (
          <line
            x1={CENTER}
            y1={CENTER}
            x2={pointOnCircle(hourAngle, HOUR_HAND_LENGTH).x}
            y2={pointOnCircle(hourAngle, HOUR_HAND_LENGTH).y}
            stroke="var(--text)"
            strokeWidth={6}
            strokeLinecap="round"
          />
        )}
        {minuteAngle !== null && (
          <line
            x1={CENTER}
            y1={CENTER}
            x2={pointOnCircle(minuteAngle, MINUTE_HAND_LENGTH).x}
            y2={pointOnCircle(minuteAngle, MINUTE_HAND_LENGTH).y}
            stroke="var(--text)"
            strokeWidth={4}
            strokeLinecap="round"
          />
        )}
        {secondAngle !== null && (
          <line
            x1={CENTER}
            y1={CENTER}
            x2={pointOnCircle(secondAngle, SECOND_HAND_LENGTH).x}
            y2={pointOnCircle(secondAngle, SECOND_HAND_LENGTH).y}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        )}
        <circle cx={CENTER} cy={CENTER} r={CENTER_PIVOT_RADIUS} fill="var(--accent)" />

        {/* hour ticks + labels */}
        {Array.from({ length: DAY_VIEW_HOURS }, (_, i) => DAY_VIEW_START_HOUR + i).map((h) => {
          const angle = angleForHours(h - DAY_VIEW_START_HOUR);
          const inner = pointOnCircle(angle, TICK_INNER);
          const outer = pointOnCircle(angle, TICK_OUTER);
          return (
            <line
              key={h}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--border)"
              strokeWidth={h % 2 === 0 ? 1.5 : 1}
            />
          );
        })}
        {HOUR_LABELS.map(({ hours, label }) => {
          const pos = pointOnCircle(angleForHours(hours), LABEL_RADIUS);
          return (
            <text
              key={hours}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="mono"
              style={{ fontSize: LABEL_FONT_SIZE_HOURS, fontWeight: 600, fill: "var(--text)" }}
            >
              {label}
            </text>
          );
        })}

        {/* now indicator */}
        {nowAngle !== null && (
          <line
            x1={pointOnCircle(nowAngle, FACE_RADIUS).x}
            y1={pointOnCircle(nowAngle, FACE_RADIUS).y}
            x2={pointOnCircle(nowAngle, CENTER - 10).x}
            y2={pointOnCircle(nowAngle, CENTER - 10).y}
            stroke="var(--accent)"
            strokeWidth={2}
            opacity={0.8}
          />
        )}

        {/* event arcs */}
        {dayEvents.map((event) => {
          const range = ranges.get(event.id);
          if (!range) return null;
          const ring = rings.get(event.id) ?? 0;
          const radius = RING_START + ring * RING_WIDTH;
          const startAngle = angleForHours(range.startHours);
          let endAngle = angleForHours(range.endHours);
          let sweep = endAngle - startAngle;
          if (sweep < 0) sweep += 360;
          if (sweep < MIN_ARC_DEGREES) {
            endAngle = startAngle + MIN_ARC_DEGREES;
          }
          const color = CATEGORY_COLORS[event.category];
          const isDragging = drag?.event.id === event.id && drag.moved;
          const startPoint = pointOnCircle(startAngle, radius);
          const endPoint = pointOnCircle(endAngle, radius);
          const midAngle = startAngle + sweep / 2;
          const labelPos = pointOnCircle(midAngle, radius);
          const title = pillTitle(event.title);
          const width = pillWidth(event.title, PILL_CHAR_PX, PILL_PAD_X);

          return (
            <g key={event.id} opacity={isDragging ? 0.85 : 1}>
              <path
                data-event-hit
                d={describeArc(radius, startAngle, endAngle)}
                fill="none"
                stroke={color}
                strokeWidth={ARC_STROKE}
                strokeLinecap="round"
                style={{ cursor: "grab", touchAction: "none" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                  beginDrag(event, "move", e.pointerId, e.clientX, e.clientY);
                }}
              />
              <g
                transform={`translate(${labelPos.x} ${labelPos.y}) rotate(${uprightRotation(midAngle)})`}
                pointerEvents="none"
              >
                <rect
                  x={-width / 2}
                  y={-PILL_HEIGHT / 2}
                  width={width}
                  height={PILL_HEIGHT}
                  rx={PILL_HEIGHT / 2}
                  fill={color}
                  stroke="var(--panel)"
                  strokeWidth={1.5}
                />
                <text
                  x={0}
                  y={1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{
                    fontSize: PILL_FONT_SIZE,
                    fontWeight: 700,
                    fill: CATEGORY_TEXT_COLORS[event.category],
                  }}
                >
                  {title}
                </text>
              </g>
              {/* resize handles (invisible hit targets only — no visible dot) */}
              <circle
                data-handle-hit
                cx={startPoint.x}
                cy={startPoint.y}
                r={HANDLE_HIT_RADIUS}
                fill="transparent"
                style={{ cursor: "ew-resize", touchAction: "none" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                  beginDrag(event, "resize-start", e.pointerId, e.clientX, e.clientY);
                }}
              />
              <circle
                data-handle-hit
                cx={endPoint.x}
                cy={endPoint.y}
                r={HANDLE_HIT_RADIUS}
                fill="transparent"
                style={{ cursor: "ew-resize", touchAction: "none" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                  beginDrag(event, "resize-end", e.pointerId, e.clientX, e.clientY);
                }}
              />
            </g>
          );
        })}

        {/* create-drag preview */}
        {createPreviewRange && (
          <path
            d={describeArc(
              CREATE_PREVIEW_RADIUS,
              angleForHours(createPreviewRange.startHours),
              angleForHours(createPreviewRange.endHours)
            )}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={ARC_STROKE - 4}
            strokeLinecap="round"
            strokeDasharray="3 5"
            opacity={0.7}
            pointerEvents="none"
          />
        )}
      </svg>
      <p className="clock-day-hint">
        Tap the clock for a 1-hour activity, or drag to set a custom time range. Drag a colored arc to
        move it, or drag its ends to resize.
      </p>
    </div>
  );
}
