import { List, Map as MapIcon } from "lucide-react";

export function EventViewToggle({
  view,
  onChange,
}: {
  view: "list" | "map";
  onChange: (view: "list" | "map") => void;
}) {
  return (
    <div className={`flex items-center gap-1 rounded-full border border-border bg-white/5 p-1 ${view === "map" ? "bg-background/85 backdrop-blur" : ""}`}>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition sm:px-4 sm:py-1.5 ${
          view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">List</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("map")}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition sm:px-4 sm:py-1.5 ${
          view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        <MapIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Map</span>
      </button>
    </div>
  );
}
