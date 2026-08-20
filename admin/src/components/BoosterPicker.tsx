import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { adminApi } from "../api";

// ===== Seletor de booster de arma (lista com balão de descrição no hover) =====

interface KindInfo {
  label: string;
  category: string;
  format: "%" | "add";
  description: string;
}

export interface BoosterDef {
  slug: string;
  name: string;
  kind: string;
  description: string;
}

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-white focus:border-fuchsia-500 focus:outline-none";

export default function BoosterPicker({ value, onChange }: { value: BoosterDef | null; onChange: (b: BoosterDef | null) => void }) {
  const [open, setOpen] = useState(false);
  const [kinds, setKinds] = useState<Record<string, KindInfo>>({});
  const [pool, setPool] = useState<BoosterDef[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    adminApi.boosters.weaponPool().then((res: any) => {
      setKinds(res?.data?.kinds || {});
      setPool(res?.data?.pool || []);
    });
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, BoosterDef[]>();
    for (const b of pool) {
      const cat = kinds[b.kind]?.category || "Outros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(b);
    }
    return Array.from(map.entries());
  }, [pool, kinds]);

  const descriptionOf = (b: BoosterDef) => kinds[b.kind]?.description || b.description || "";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={inputClass + " flex items-center justify-between gap-2"}
      >
        <span className="truncate text-left">
          {value ? `${value.name} (${kinds[value.kind]?.label || value.kind})` : "Selecionar booster..."}
        </span>
        <ChevronDown size={14} className="shrink-0 text-gray-500" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-dark-900 border border-dark-600 rounded-lg shadow-xl">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-dark-700 transition-colors"
          >
            — Nenhum (IA escolhe) —
          </button>
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-gray-500">{cat}</p>
              {items.map((b) => (
                <div key={b.slug} className="group">
                  <button
                    type="button"
                    onClick={() => {
                      onChange(b);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${value?.slug === b.slug ? "text-fuchsia-300 bg-fuchsia-500/10" : "text-gray-200 hover:bg-dark-700"}`}
                  >
                    {b.name} <span className="text-gray-500">({kinds[b.kind]?.label || b.kind})</span>
                  </button>
                  {descriptionOf(b) && (
                    <div className="px-3 pb-2 hidden group-hover:block">
                      <div className="relative text-[10px] leading-relaxed text-gray-200 bg-dark-800 border border-dark-500 rounded-md px-2.5 py-1.5">
                        <span className="absolute -top-1.5 left-3 w-3 h-3 bg-dark-800 border-l border-t border-dark-500 rotate-45" />
                        {descriptionOf(b)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}