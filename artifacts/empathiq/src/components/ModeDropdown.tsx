import { useState, useRef, useEffect } from "react";

export interface DropdownMode {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

interface Props {
  modes: DropdownMode[];
  activeMode: DropdownMode;
  onSelect: (modeId: string) => void;
}

export default function ModeDropdown({ modes, activeMode, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border border-white/10 bg-white/5 transition-colors hover:bg-white/8"
        style={{ color: activeMode.color }}
      >
        <span>{activeMode.emoji}</span>
        <span>{activeMode.label}</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-50 rounded-xl overflow-hidden border border-white/12 shadow-2xl min-w-[190px]"
          style={{ backgroundColor: "#0c0c14" }}
        >
          {modes.map((mode) => {
            const isActive = mode.id === activeMode.id;
            return (
              <button
                key={mode.id}
                onClick={() => { onSelect(mode.id); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-colors hover:bg-white/5"
                style={{ color: isActive ? mode.color : "var(--muted-foreground)" }}
              >
                <span>{mode.emoji}</span>
                <span className="flex-1 text-left">{mode.label}</span>
                {isActive && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
