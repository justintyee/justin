"use client";

import { useEffect, useState } from "react";
import { GeocodeCandidate, searchAddress } from "@/lib/geocode";

interface AddressSearchInputProps {
  address: string;
  onAddressChange: (address: string) => void;
  onSelectCandidate: (candidate: GeocodeCandidate) => void;
  selectedLabel?: string | null;
}

export function AddressSearchInput({
  address,
  onAddressChange,
  onSelectCandidate,
  selectedLabel,
}: AddressSearchInputProps) {
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing an existing event pre-fills `address` from its saved location.
  // Without this, just opening the edit form would immediately fire a
  // search and pop the suggestions list open over the rest of the form —
  // even for an address that was never successfully geocoded (no pin, so
  // `selectedLabel` alone can't guard against it). Only search once the
  // user actually types into the field this session, not from the initial
  // mount value.
  const [hasTyped, setHasTyped] = useState(false);

  function handleChange(value: string) {
    setHasTyped(true);
    onAddressChange(value);
  }

  const isSearchable = hasTyped && address.trim().length >= 3 && !selectedLabel;

  useEffect(() => {
    if (!isSearchable) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchAddress(address, controller.signal)
        .then(setCandidates)
        .catch((err: Error) => {
          if (err.name !== "AbortError") {
            setError("Couldn't search that address. Try again.");
          }
        })
        .finally(() => setLoading(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [address, isSearchable]);

  const visibleCandidates = isSearchable ? candidates : [];

  return (
    <div className="relative">
      <input
        type="text"
        value={address}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search an address in Mexico City..."
      />
      {selectedLabel && (
        <p className="mt-1 text-xs" style={{ color: "var(--green)" }}>
          Pinned: {selectedLabel}
        </p>
      )}
      {isSearchable && loading && (
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Searching...
        </p>
      )}
      {isSearchable && error && (
        <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {visibleCandidates.length > 0 && (
        <ul
          className="absolute z-10 mt-1 w-full overflow-hidden"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow)",
          }}
        >
          {visibleCandidates.map((candidate) => (
            <li key={candidate.placeId}>
              <button
                type="button"
                onClick={() => {
                  onSelectCandidate(candidate);
                  setCandidates([]);
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm"
                style={{ background: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {candidate.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
