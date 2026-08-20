import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { adminApi } from "../api";

// ===== Editor do booster único de arma =====
// O admin escolhe 1 booster da lista (com tooltip explicando a mecânica de cada kind)
// e define o valor em % (0 ou 0.1 até 250%). Salva como [{ slug, name, kind, value }].

interface KindInfo {
  label: string;
  category: string;
  format: "%" | "add";
  description: string;
}

interface BoosterDef {
  slug: string;
  name: string;
  kind: string;
  description: string;
}

interface BoosterInstance {
  slug: string;
  name: string;
  kind: string;
  value: number;
}

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-white focus:border-accent-500 focus:outline-none";

function parseBooster(raw: any): BoosterInstance | null {
  if (Array.isArray(raw) && raw.length > 0) {
    const b = raw[0];
    if (b && typeof b === "object") {
      return { slug: String(b.slug || ""), name: String(b.name || b.slug || ""), kind: String(b.kind || ""), value: Number(b.value) || 0.1 };
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { slug: String(raw.slug || ""), name: String(raw.name || raw.slug || ""), kind: String(raw.kind || ""), value: Number(raw.value) || 0.1 };
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parseBooster(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

export default function WeaponBoosterField({ value, onChange }: { value: any; onChange: (v: BoosterInstance[] | null) => void }) {
  const [kinds, setKinds] = useState<Record<string, KindInfo>>({});
  const [pool, setPool] = useState<BoosterDef[]>([]);
  const booster = useMemo(() => parseBooster(value), [value]);

  useEffect(() => {
    adminApi.boosters.weaponPool().then((res: any) => {
      setKinds(res?.data?.kinds || {});
      setPool(res?.data?.pool || []);
    });
  }, []);

  const kindLabel = (kind: string) => kinds[kind]?.label || kind;
  const categoryOf = (kind: string) => kinds[kind]?.category || "Outros";
  const grouped = useMemo(() => {
    const map = new Map<string, BoosterDef[]>();
    for (const b of pool) {
      const cat = kinds[b.kind]?.category || "Outros";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(b);
    }
    return Array.from(map.entries());
  }, [pool, kinds]);

  const selectBooster = (slug: string) => {
    const def = pool.find((b) => b.slug === slug);
    if (!def) {
      onChange(null);
      return;
    }
    onChange([{ slug: def.slug, name: def.name, kind: def.kind, value: booster?.value ?? 0.1 }]);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Booster (1 por arma)</label>
          <select
            className={inputClass}
            value={booster?.slug || ""}
            onChange={(e) => selectBooster(e.target.value)}
          >
            <option value="">— Nenhum booster —</option>
            {grouped.map(([cat, items]) => (
              <optgroup key={cat} label={cat}>
                {items.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.name} ({kindLabel(b.kind)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 mb-1">Valor (%)</label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={250}
            className={inputClass}
            placeholder="0.1 a 250"
            value={booster ? Number(booster.value) || 0 : ""}
            onChange={(e) => {
              if (!booster) return;
              const val = Math.min(250, Math.max(0, Number(e.target.value)));
              onChange([{ ...booster, value: Number.isNaN(val) ? 0 : val }]);
            }}
          />
        </div>
      </div>

      {booster?.kind && kinds[booster.kind] ? (
        <div className="flex items-start gap-2 border border-dark-700 rounded-lg px-3 py-2 bg-dark-900/50">
          <Info size={14} className="text-accent-400 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-300">
            <span className="text-accent-400 font-semibold">{kindLabel(booster.kind)}</span>
            <span className="text-gray-500"> — {kinds[booster.kind].description}</span>
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Selecione um booster para ver como ele funciona. O valor pode ser 0 (desativado) ou de 0.1% até 250%.</p>
      )}
    </div>
  );
}