"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { CATEGORY_COLORS } from "@/lib/categoryColors";
import { TripEvent } from "@/lib/types";

const MEXICO_CITY_CENTER: [number, number] = [19.4326, -99.1332];

// `lat != null` alone lets NaN through (NaN != null is true), and Leaflet
// throws "Invalid LatLng object" on NaN — an uncaught throw here crashes
// the whole page, not just the map, since nothing catches it upstream.
function hasValidCoords(event: TripEvent): event is TripEvent & { lat: number; lng: number } {
  return Number.isFinite(event.lat) && Number.isFinite(event.lng);
}

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;
      width:18px;
      height:18px;
      border-radius:50% 50% 50% 0;
      background:${color};
      border:2px solid white;
      box-shadow:0 1px 3px rgba(0,0,0,0.4);
      transform:rotate(-45deg);
    "></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -18],
  });
}

// Reads the container's live layout box directly rather than Leaflet's own
// cached size, so it's accurate no matter when invalidateSize() last ran.
function hasVisibleContainer(map: L.Map): boolean {
  const rect = map.getContainer().getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Bumps whenever the map's container is resized — including the
// display:none -> visible transition when switching back to the mobile
// Map tab, which is otherwise invisible to a plain effect dependency list.
function useContainerResizeTick(map: L.Map): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => setTick((t) => t + 1));
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return tick;
}

function FitBoundsOnChange({ events }: { events: TripEvent[] }) {
  const map = useMap();
  const resizeTick = useContainerResizeTick(map);

  useEffect(() => {
    // A hidden container (behind the mobile Calendar/Map tab switcher) is
    // 0x0. fitBounds/setView derive a pixel-space transform from the
    // container size, and Leaflet's own math divides by that size — on a
    // 0x0 container it produces NaN and throws, crashing the whole page.
    // Skipping here and re-running via resizeTick once visible again means
    // the map still ends up showing the right thing, just not while no one
    // could see it anyway.
    if (!hasVisibleContainer(map)) return;

    const withCoords = events.filter(hasValidCoords);
    if (withCoords.length === 0) return;

    map.invalidateSize();

    if (withCoords.length === 1) {
      map.setView([withCoords[0].lat, withCoords[0].lng], 14);
      return;
    }

    const bounds = L.latLngBounds(withCoords.map((e) => [e.lat, e.lng]));
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [events, map, resizeTick]);

  return null;
}

function FocusOnSelected({ event }: { event: TripEvent | null }) {
  const map = useMap();
  const resizeTick = useContainerResizeTick(map);

  useEffect(() => {
    if (!event || !hasValidCoords(event)) return;
    // See the matching guard in FitBoundsOnChange — flyTo's fly-animation
    // curve divides by the container size, so a hidden (0x0) container
    // turns this into the exact same NaN crash.
    if (!hasVisibleContainer(map)) return;
    map.invalidateSize();
    map.flyTo([event.lat, event.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [event, map, resizeTick]);

  return null;
}

// Leaflet measures its container on mount. If that happens while the
// container is display:none (e.g. behind the mobile Calendar/Map tab
// switcher), the map ends up the wrong size until something nudges it.
function InvalidateSizeOnResize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

interface MapPanelProps {
  events: TripEvent[];
  onMarkerClick: (event: TripEvent) => void;
  focusEvent?: TripEvent | null;
}

export function MapPanel({ events, onMarkerClick, focusEvent = null }: MapPanelProps) {
  const pinned = useMemo(() => events.filter(hasValidCoords), [events]);

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <MapContainer
        center={MEXICO_CITY_CENTER}
        zoom={12}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBoundsOnChange events={pinned} />
        <FocusOnSelected event={focusEvent} />
        <InvalidateSizeOnResize />
        {pinned.map((event) => (
          <Marker
            key={event.id}
            position={[event.lat as number, event.lng as number]}
            icon={pinIcon(CATEGORY_COLORS[event.category])}
            eventHandlers={{ click: () => onMarkerClick(event) }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{event.title}</p>
                {event.place_name && <p className="text-zinc-600">{event.place_name}</p>}
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(event.start_time).toLocaleString(undefined, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
