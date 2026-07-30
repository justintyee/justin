"use client";

export type MobileTab = "calendar" | "map";

interface MobileTabSwitcherProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

export function MobileTabSwitcher({ active, onChange }: MobileTabSwitcherProps) {
  return (
    <div className="seg lg:hidden" style={{ width: "100%" }}>
      {(["calendar", "map"] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={active === tab ? "on" : ""}
          style={{ flex: 1 }}
        >
          {tab === "calendar" ? "Calendar" : "Map & Filters"}
        </button>
      ))}
    </div>
  );
}
