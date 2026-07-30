"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Category } from "@/lib/types";

interface FilterContextValue {
  activeCategory: Category | null;
  toggleCategory: (category: Category) => void;
  isVisible: (category: Category) => boolean;
}

const FilterContext = createContext<FilterContextValue | null>(null);

// null means "show all" — only one category can be highlighted at a time.
export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);

  const toggleCategory = useCallback((category: Category) => {
    setActiveCategory((prev) => (prev === category ? null : category));
  }, []);

  const isVisible = useCallback(
    (category: Category) => activeCategory === null || activeCategory === category,
    [activeCategory]
  );

  const value = useMemo(
    () => ({ activeCategory, toggleCategory, isVisible }),
    [activeCategory, toggleCategory, isVisible]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilter must be used within a FilterProvider");
  return ctx;
}
