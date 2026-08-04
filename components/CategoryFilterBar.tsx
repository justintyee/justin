"use client";

import { useFilter } from "@/context/FilterContext";
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_TEXT_COLORS } from "@/lib/categoryColors";
import { CATEGORIES } from "@/lib/types";

export function CategoryFilterBar() {
  const { activeCategory, toggleCategory } = useFilter();

  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORIES.map((category) => {
        const isOn = activeCategory === category;
        const color = CATEGORY_COLORS[category];
        const textColor = CATEGORY_TEXT_COLORS[category];
        return (
          <button
            key={category}
            type="button"
            onClick={() => toggleCategory(category)}
            className={`filter-chip ${isOn ? "on" : ""}`}
            style={{
              backgroundColor: color,
              color: textColor,
              borderColor: isOn ? "var(--text)" : "transparent",
            }}
          >
            {CATEGORY_LABELS[category]}
          </button>
        );
      })}
    </div>
  );
}
