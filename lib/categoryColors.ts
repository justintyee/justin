import { Category } from "./types";

// Single source of truth for category color coding — consumed by the
// calendar (event block color), the map (pin color), and the filter bar
// (button color), so a change here propagates everywhere at once.
export const CATEGORY_COLORS: Record<Category, string> = {
  daytrip: "#F5A623", // gold/amber
  museums: "#C8E6C9", // pale green
  food: "#EC1E93", // magenta pink
  attractions: "#1E96FC", // blue
  cafe: "#E64A19", // deep orange-red
  drinks: "#22D3EE", // cyan — was dark gray, too low-contrast on the dark background
  architecture: "#7C3AED", // purple
  stores: "#F48FC0", // light pink
};

// Text color to use ON TOP of the category color above — some fills
// (daytrip, museums, stores) are too light for white text to read well.
export const CATEGORY_TEXT_COLORS: Record<Category, string> = {
  daytrip: "#1A1A1A",
  museums: "#1A1A1A",
  food: "#FFFFFF",
  attractions: "#FFFFFF",
  cafe: "#FFFFFF",
  drinks: "#1A1A1A",
  architecture: "#FFFFFF",
  stores: "#1A1A1A",
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
