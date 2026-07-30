export type Category =
  | "daytrip"
  | "museums"
  | "food"
  | "attractions"
  | "cafe"
  | "drinks"
  | "architecture"
  | "stores";

export const CATEGORIES: Category[] = [
  "daytrip",
  "museums",
  "food",
  "attractions",
  "cafe",
  "drinks",
  "architecture",
  "stores",
];

export interface Trip {
  id: string;
  name: string;
  created_at: string;
}

export interface TripEvent {
  id: string;
  trip_id: string;
  title: string;
  category: Category;
  start_time: string; // ISO timestamp
  end_time: string; // ISO timestamp
  address: string | null;
  place_name: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewTripEvent = Omit<TripEvent, "id" | "created_at" | "updated_at">;
