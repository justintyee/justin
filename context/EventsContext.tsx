"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { supabase } from "@/lib/supabaseClient";
import { NewTripEvent, TripEvent } from "@/lib/types";

interface EventsState {
  events: TripEvent[];
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: "LOADING" }
  | { type: "SET_ALL"; events: TripEvent[] }
  | { type: "ERROR"; error: string }
  | { type: "UPSERT"; event: TripEvent }
  | { type: "REMOVE"; id: string };

function reducer(state: EventsState, action: Action): EventsState {
  switch (action.type) {
    case "LOADING":
      return { ...state, loading: true, error: null };
    case "SET_ALL":
      return { events: action.events, loading: false, error: null };
    case "ERROR":
      return { ...state, loading: false, error: action.error };
    case "UPSERT": {
      const existing = state.events.find((e) => e.id === action.event.id);
      // Reconcile against the local copy so a Realtime echo of our own
      // optimistic write (or a stale out-of-order message) never regresses
      // state that's already newer.
      if (existing && existing.updated_at >= action.event.updated_at) {
        return state;
      }
      const withoutExisting = state.events.filter((e) => e.id !== action.event.id);
      return { ...state, events: [...withoutExisting, action.event] };
    }
    case "REMOVE":
      return { ...state, events: state.events.filter((e) => e.id !== action.id) };
    default:
      return state;
  }
}

interface EventsContextValue extends EventsState {
  addEvent: (event: NewTripEvent) => Promise<void>;
  updateEvent: (id: string, patch: Partial<NewTripEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
}

const EventsContext = createContext<EventsContextValue | null>(null);

export function EventsProvider({
  tripId,
  children,
}: {
  tripId: string;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    events: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      dispatch({ type: "LOADING" });
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("trip_id", tripId)
        .order("start_time", { ascending: true });

      if (cancelled) return;
      if (error) {
        dispatch({ type: "ERROR", error: error.message });
        return;
      }
      dispatch({ type: "SET_ALL", events: (data as TripEvent[]) ?? [] });
    }

    loadInitial();

    const channel = supabase
      .channel(`events-trip-${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<TripEvent>;
            if (oldRow.id) dispatch({ type: "REMOVE", id: oldRow.id });
            return;
          }
          dispatch({ type: "UPSERT", event: payload.new as TripEvent });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  const addEvent = useCallback(
    async (event: NewTripEvent) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const optimistic: TripEvent = {
        ...event,
        id,
        created_at: now,
        updated_at: now,
      };
      dispatch({ type: "UPSERT", event: optimistic });

      const { error } = await supabase.from("events").insert({ id, ...event });
      if (error) {
        dispatch({ type: "REMOVE", id });
        throw error;
      }
    },
    []
  );

  const updateEvent = useCallback(
    async (id: string, patch: Partial<NewTripEvent>) => {
      const existing = state.events.find((e) => e.id === id);
      if (!existing) return;

      const optimistic: TripEvent = {
        ...existing,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      dispatch({ type: "UPSERT", event: optimistic });

      const { error } = await supabase.from("events").update(patch).eq("id", id);
      if (error) {
        dispatch({ type: "UPSERT", event: existing });
        throw error;
      }
    },
    [state.events]
  );

  const deleteEvent = useCallback(async (id: string) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) throw error;
    dispatch({ type: "REMOVE", id });
  }, []);

  const value = useMemo(
    () => ({ ...state, addEvent, updateEvent, deleteEvent }),
    [state, addEvent, updateEvent, deleteEvent]
  );

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error("useEvents must be used within an EventsProvider");
  return ctx;
}
