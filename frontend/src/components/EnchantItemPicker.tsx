import { createPortal } from "react-dom";
import { Sword, Shield, HardHat, Wind, Sparkles, X, Package, Loader2 } from "lucide-react";
import { EntityIcon } from "./EntityIcon";
import { effectiveEnchantmentStats } from "../lib/enchantmentStats";

const CATEGORIES: { type: string; label: string; icon: any; color: string }[] = [
  { type: "weapon", label: "Armas", icon: Sword, color: "text-orange-300" },
  { type: "armor", label: "Armaduras", icon: Shield, color: "text-yellow-300" },
  { type: "helm", label: "Elmos", icon: HardHat, color: "text-gray-300" },
  { type: "cape", label: "Capas", icon: Wind, color: "text-cyan-300" },
];

const CORE_LABELS: { key: string; label: string }[] = [
  { key: "strength", label: "Força" },
  { key: "intellect", label: "Intelecto" },
  { key: "endurance", label: "Vigor" },
  { key: "dexterity", label: "Destreza" },
  { key: "wisdom", label: "Sabedoria" },
  { key: "luck", label: "Sorte" },
];

const RARITY_TEXT: Record<string, string> = {
  common: "text-gray-400",
  uncommon: "text-green-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-orange-400",
  mythic: "text-red-400",
  artifact: "text-yellow-400",
};

interface Props {
  enchantment: any;
  items: any[];
  busyId?: string | null;
  loading?: boolean;
  onApply: (inventoryId: string) => void;
  onKeep: () => void;
  onClose: () => void;
}

export function EnchantItemPicker({ enchantment, items, busyId, loading, onApply, onKeep, onClose }: Props) {
  const stats = effectiveEnchantmentStats(enchantment);
  const slots = (() => {
    try {
      const parsed = JSON.parse(enchantment.compatibleSlots || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const minRank = Number(enchantment.minRank) || 1;
  const levelReq = Number(enchantment.level) || 1;

  const groups = CATEGORIES.map((c) => ({ ...c, rows: items.filter((i) => i.item?.type === c.type) }));
  const total = groups.reduce((s, g) => s + g.rows.length, 0);

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="panel w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center overflow-hidden shrink-0">
              {enchantment.icon ? (
                <EntityIcon src={enchantment.icon} size={24} className="text-purple-400" imgClassName="w-full h-full object-contain p-1" />
              ) : (
                <Sparkles size={22} className="text-purple-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold">{enchantment.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {enchantment.level > 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">Nv. {enchantment.level}</span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-300/90">
                  {CORE_LABELS.map(({ key, label }) => `${label} +${stats[key]}`).join(" · ")}
                </span>
              </div>
              {enchantment.description && (
                <p className="text-[11px] text-gray-500 line-clamp-1 mt-1">{enchantment.description}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 shrink-0"><X size={18} /></button>
        </div>

        <p className="text-[11px] text-gray-400 mb-3">
          Escolha o item para encantar — o encantamento substitui os core stats do item. Itens sem os requisitos ficam bloqueados.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-500 gap-2">
            <Loader2 size={20} className="animate-spin" /> Carregando seus itens...
          </div>
        ) : (
          <>
            {groups.map((g) => {
              if (g.rows.length === 0) return null;
              const Icon = g.icon;
              return (
                <div key={g.type} className="mb-4">
                  <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2 ${g.color}`}>
                    <Icon size={13} /> {g.label} <span className="text-gray-600 normal-case font-normal">({g.rows.length})</span>
                  </p>
                  <div className="space-y-2">
                    {g.rows.map((inv) => {
                      const item = inv.item;
                      const ok =
                        Number(item.rank) >= minRank &&
                        Number(item.level) >= levelReq &&
                        (slots.length === 0 || slots.includes(item.type));
                      const reason = !ok
                        ? Number(item.rank) < minRank
                          ? `Requer rank ${minRank}`
                          : Number(item.level) < levelReq
                            ? `Requer item Nv. ${levelReq}`
                            : "Incompatível"
                        : "";
                      const busy = busyId === inv.id;
                      return (
                        <div key={inv.id} className={`flex items-center gap-3 bg-dark-800/50 rounded-lg p-2.5 border ${ok ? "border-dark-600" : "border-dark-700 opacity-60"}`}>
                          <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center overflow-hidden shrink-0">
                            {item.icon ? (
                              <EntityIcon src={item.icon} size={18} className="text-white/80" imgClassName="w-full h-full object-contain p-0.5" />
                            ) : (
                              <Package size={18} className="text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className={`text-[11px] capitalize ${RARITY_TEXT[item.rarity || "common"] || "text-gray-400"}`}>
                              {item.rarity} • Nv. {item.level} • Rank {item.rank}
                              {inv.isEquipped ? " • Equipado" : ""}
                              {inv.quantity > 1 ? ` • x${inv.quantity}` : ""}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {item.type === "weapon" && Number(item.dps) > 0 ? `DPS ${Number(item.dps).toLocaleString()} · ` : ""}
                              {CORE_LABELS.map(({ key, label }) =>
                                Number(item[key]) > 0 ? `${label} +${Number(item[key])}` : null
                              ).filter(Boolean).join(" · ") || "Sem stats próprios"}
                            </p>
                          </div>
                          <button
                            onClick={() => ok && onApply(inv.id)}
                            disabled={!ok || !!busyId}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                              ok ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-dark-700 text-gray-500 cursor-not-allowed"
                            }`}
                            title={reason}
                          >
                            {busy ? "Encantando..." : ok ? "Encantar" : reason}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {total === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Package size={36} className="mx-auto mb-2 opacity-50" />
                <p>Você não tem itens encantáveis (armas, armaduras, elmos ou capas).</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-dark-600">
              <button onClick={onKeep} className="btn-secondary text-xs px-3 py-1.5">Guardar no inventário</button>
              <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}