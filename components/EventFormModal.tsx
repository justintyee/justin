"use client";

import { useEffect, useState } from "react";
import { useEvents } from "@/context/EventsContext";
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_TEXT_COLORS } from "@/lib/categoryColors";
import { GeocodeCandidate, searchAddress } from "@/lib/geocode";
import { Category, CATEGORIES, TripEvent } from "@/lib/types";
import { AddressSearchInput } from "./AddressSearchInput";

type EventFormModalProps = {
  tripId: string;
  onClose: () => void;
  onSaved?: (info: { title: string; geocodeFailed: boolean }) => void;
} & (
  | { mode: "create"; initialRange: { start: Date; end: Date }; initialEvent?: undefined }
  | { mode: "edit"; initialEvent: TripEvent; initialRange?: undefined }
);

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}

export function EventFormModal(props: EventFormModalProps) {
  const { tripId, mode, onClose, onSaved } = props;
  const { addEvent, updateEvent, deleteEvent } = useEvents();
  // Autofocusing the title field pops the mobile keyboard open the instant
  // the dialog appears, before the user has even seen it — desktop doesn't
  // have that problem, so keep the convenience there and only skip it on
  // mobile, where the keyboard should appear solely on an explicit tap.
  //
  // This can't use the shared useIsMobile() hook: that hook deliberately
  // starts at a safe `false` default and only corrects itself in an effect
  // (to stay SSR-safe), but autoFocus only matters at the exact instant of
  // mount — by the time the hook's effect corrects it, the browser has
  // already focused the input and raised the keyboard. This modal only
  // ever mounts client-side in response to a click, never during SSR, so
  // reading matchMedia synchronously via a lazy initializer is safe here.
  const [autoFocusTitle] = useState(
    () => typeof window !== "undefined" && !window.matchMedia("(max-width: 640px)").matches
  );

  const initialEvent = mode === "edit" ? props.initialEvent : undefined;
  const initialStart = mode === "edit" ? new Date(props.initialEvent.start_time) : props.initialRange.start;
  const initialEnd = mode === "edit" ? new Date(props.initialEvent.end_time) : props.initialRange.end;

  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [category, setCategory] = useState<Category>(initialEvent?.category ?? "food");
  const [start, setStart] = useState(toLocalInputValue(initialStart));
  const [end, setEnd] = useState(toLocalInputValue(initialEnd));
  const [address, setAddress] = useState(initialEvent?.address ?? "");
  const [placeName, setPlaceName] = useState<string | null>(initialEvent?.place_name ?? null);
  const [lat, setLat] = useState<number | null>(initialEvent?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initialEvent?.lng ?? null);
  const [notes, setNotes] = useState(initialEvent?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function handleSelectCandidate(candidate: GeocodeCandidate) {
    setLat(candidate.lat);
    setLng(candidate.lng);
    setPlaceName(candidate.displayName.split(",")[0]);
    setAddress(candidate.displayName);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Give this activity a title.");
      return;
    }
    const startIso = fromLocalInputValue(start);
    const endIso = fromLocalInputValue(end);
    if (new Date(endIso) <= new Date(startIso)) {
      setFormError("End time must be after start time.");
      return;
    }

    setSaving(true);
    try {
      // If the user typed an address but never picked a suggestion (e.g.
      // they tabbed/clicked away), geocode it now rather than silently
      // saving with no coordinates and no map pin.
      let finalLat = lat;
      let finalLng = lng;
      let finalPlaceName = placeName;
      if (finalLat == null && address.trim().length >= 3) {
        try {
          const [top] = await searchAddress(address.trim());
          if (top) {
            finalLat = top.lat;
            finalLng = top.lng;
            finalPlaceName = top.displayName.split(",")[0];
          }
        } catch {
          // Fall through and save without coordinates.
        }
      }

      const payload = {
        trip_id: tripId,
        title: title.trim(),
        category,
        start_time: startIso,
        end_time: endIso,
        address: address.trim() || null,
        place_name: finalPlaceName,
        lat: finalLat,
        lng: finalLng,
        notes: notes.trim() || null,
      };

      if (mode === "create") {
        await addEvent(payload);
      } else if (initialEvent) {
        await updateEvent(initialEvent.id, payload);
      }
      onSaved?.({
        title: payload.title,
        geocodeFailed: address.trim().length > 0 && finalLat == null,
      });
      onClose();
    } catch {
      setFormError("Couldn't save this activity. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialEvent) return;
    setSaving(true);
    try {
      await deleteEvent(initialEvent.id);
      onClose();
    } catch {
      setFormError("Couldn't delete this activity. Try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.45)", zIndex: 2000 }}
    >
      <div className="dlg flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden">
        <div className="dlg-head justify-between">
          <span>{mode === "create" ? "New activity" : "Edit activity"}</span>
          <button type="button" onClick={onClose} className="link-btn" aria-label="Close">
            &#x2715;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dlg-body overflow-y-auto">
          <div className="frow">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dinner at Contramar"
              autoFocus={autoFocusTitle}
            />
          </div>

          <div className="frow">
            <label>Category</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const on = category === c;
                const color = CATEGORY_COLORS[c];
                const textColor = CATEGORY_TEXT_COLORS[c];
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`filter-chip ${on ? "on" : ""}`}
                    style={{
                      backgroundColor: color,
                      color: textColor,
                      borderColor: on ? "var(--text)" : "transparent",
                    }}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="frow min-w-0 sm:flex-1">
              <label>Start</label>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="frow min-w-0 sm:flex-1">
              <label>End</label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="frow">
            <label>Location</label>
            <AddressSearchInput
              address={address}
              onAddressChange={(value) => {
                setAddress(value);
                setLat(null);
                setLng(null);
                setPlaceName(null);
              }}
              onSelectCandidate={handleSelectCandidate}
              selectedLabel={lat != null ? placeName ?? address : null}
            />
          </div>

          <div className="frow">
            <label>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {formError && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {formError}
            </p>
          )}

          <div className="dlg-actions">
            {mode === "edit" ? (
              <button type="button" onClick={handleDelete} disabled={saving} className="danger-btn">
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="ghost-btn">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="primary-btn">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
