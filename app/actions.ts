"use server";

import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export async function createTrip() {
  const { data, error } = await supabase.from("trips").insert({}).select().single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create a trip");
  }

  redirect(`/trip/${data.id}`);
}
