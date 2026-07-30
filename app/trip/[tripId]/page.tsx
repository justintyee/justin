import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TripClient } from "./TripClient";

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  const { data: trip, error } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();

  if (error || !trip) {
    notFound();
  }

  return <TripClient tripId={trip.id} tripName={trip.name} />;
}
