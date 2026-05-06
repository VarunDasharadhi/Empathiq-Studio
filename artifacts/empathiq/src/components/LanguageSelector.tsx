import { useState, useRef, useEffect } from "react";
import { LANGUAGES, type LangCode } from "@/App";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  value: LangCode;
  onChange: (code: LangCode) => void;
}

export default function LanguageSelector({ value, onChange }: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = LANGUAGES.find((l) => l.code === value) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 h-7 rounded-lg bg-white/5 border border-white/10 text-muted-foreground text-[10px] px-2 hover:bg-white/8 hover:text-foreground transition-colors cursor-pointer select-none"
        title={selected.name}
      >
        <span>{selected.flag}</span>
        {isMobile ? (
          <span className="font-mono font-medium tracking-tight">{selected.code}</span>
        ) : (
          <span className="max-w-[80px] truncate">{selected.name}</span>
        )}
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="opacity-50 flex-shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50 py-1"
          style={{ backgroundColor: "#0d0d12" }}
        >
          {LANGUAGES.map((lang) => {
            const isActive = lang.code === value;
            return (
              <button
                key={lang.code}
                onClick={() => { onChange(lang.code as LangCode); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors text-left ${
                  isActive
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <span className="text-sm leading-none">{lang.flag}</span>
                <span className="flex-1">{lang.name}</span>
                <span className="font-mono text-[9px] opacity-50">{lang.code}</span>
                {isActive && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-white/6" />

          {/* Coming soon */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 text-[11px] cursor-default select-none opacity-45">
            <span className="text-sm leading-none">🇮🇳</span>
            <span className="flex-1 text-muted-foreground">Indian languages</span>
            <span className="text-[9px] text-muted-foreground/70 bg-white/5 rounded px-1 py-0.5">soon</span>
          </div>
        </div>
      )}
    </div>
  );
}
