import { createTrip } from "./actions";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Mexico City Trip Planner</h1>
      <p className="max-w-sm text-sm text-zinc-500">
        Plan activities together on a shared calendar and map. Anyone with the trip&apos;s
        link can view and edit it &mdash; no account needed.
      </p>
      <form action={createTrip}>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Start a new trip
        </button>
      </form>
    </main>
  );
}
