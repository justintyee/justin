import { Category } from "./types";

// Single source of truth for category color coding — consumed by the
// calendar (event block color), the map (pin color), and the filter bar
// (button color), so a change here propagates everywhere at once.
//
// These are deliberately mid-saturation/mid-lightness ("600–700" tier)
// tones rather than pale pastels or near-black grays: the filter chips
// use these hex values directly as text/border color against the app's
// own background, which is near-white in light mode and near-black in
// dark mode. A pale color (e.g. the old pale green/pink) disappears on a
// light background; a very dark color (e.g. the old dark gray) disappears
// on a dark background. Mid-tones stay legible against both extremes.
export const CATEGORY_COLORS: Record<Category, string> = {
  daytrip: "#B45309", // amber (deeper shade — #D97706 dipped just under 3:1 contrast in light mode)
  museums: "#16A34A", // green
  food: "#E11D48", // rose
  attractions: "#2563EB", // blue
  cafe: "#C2410C", // deep orange
  drinks: "#0E7490", // teal/cyan
  architecture: "#7C3AED", // violet
  stores: "#C026D3", // fuchsia
};

// Text color to use ON TOP of the category color above (the filled/"on"
// chip state, calendar blocks). All eight are dark/saturated enough for
// white text at this point.
export const CATEGORY_TEXT_COLORS: Record<Category, string> = {
  daytrip: "#FFFFFF",
  museums: "#FFFFFF",
  food: "#FFFFFF",
  attractions: "#FFFFFF",
  cafe: "#FFFFFF",
  drinks: "#FFFFFF",
  architecture: "#FFFFFF",
  stores: "#FFFFFF",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  daytrip: "Daytrip",
  museums: "Museums",
  food: "Food",
  attractions: "Attractions",
  cafe: "Cafe",
  drinks: "Drinks",
  architecture: "Architecture",
  stores: "Stores",
};
