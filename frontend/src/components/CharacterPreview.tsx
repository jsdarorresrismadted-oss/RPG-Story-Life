import { Sword, Crown, HardHat, Shield, Wind, Gem, Link2 } from "lucide-react";
import { EntityIcon } from "./EntityIcon";

interface PreviewItem {
  item: { name: string; icon?: string | null; rarity?: string; type?: string };
}

interface CharacterPreviewProps<T extends PreviewItem> {
  equipped: Record<string, T>;
  onSlotClick?: (slot: string, inv: T | undefined) => void;
  onClassClick?: () => void;
  className?: string;
  classInfo?: { name?: string | null; icon?: string | null } | null;
}

const SLOT_LABELS: Record<string, string> = {
  weapon: "Arma",
  class: "Classe",
  helm: "Capacete",
  armor: "Armadura",
  cape: "Capa",
  ring: "Anel",
  necklace: "Colar",
};

const SLOT_ORDER = ["helm", "necklace", "armor", "cape", "ring", "weapon", "class"];
const EQUIP_SLOTS = SLOT_ORDER.slice(0, 5);
const AUX_SLOTS = SLOT_ORDER.slice(5);

const SLOT_ICONS: Record<string, any> = {
  weapon: Sword,
  class: Crown,
  helm: HardHat,
  armor: Shield,
  cape: Wind,
  ring: Gem,
  necklace: Link2,
};

const SLOT_ICON_COLOR: Record<string, string> = {
  weapon: "text-orange-300",
  class: "text-purple-300",
  helm: "text-gray-300",
  armor: "text-yellow-300",
  cape: "text-cyan-300",
  ring: "text-cyan-300",
  necklace: "text-cyan-300",
};

export default function CharacterPreview<T extends PreviewItem>({
  equipped,
  onSlotClick,
  onClassClick,
  className,
  classInfo,
}: CharacterPreviewProps<T>) {
  const renderSlot = (slot: string) => {
    const inv = equipped[slot];
    const Icon = SLOT_ICONS[slot] ?? Shield;
    const isClass = slot === "class";
    const cls = isClass && !inv ? classInfo : null;
    const active = !!inv || !!cls;
    const iconSrc = inv?.item?.icon ?? (cls?.icon || null);
    const labelText = inv ? inv.item.name : cls?.name ? cls.name : SLOT_LABELS[slot] ?? slot;
    return (
      <button
        key={slot}
        onClick={() => (isClass ? onClassClick?.() : onSlotClick?.(slot, inv))}
        className={`w-16 min-h-[72px] rounded-xl border p-1.5 flex flex-col items-center justify-center gap-1 transition-colors ${
          active
            ? "border-purple-500/40 bg-gradient-to-br from-purple-600/20 to-blue-600/10"
            : "border-dashed border-dark-600 bg-dark-800/40 hover:border-dark-400"
        }`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          active ? "bg-gradient-to-br from-purple-600 to-blue-600" : "bg-dark-800/60"
        }`}>
          {iconSrc ? (
            <EntityIcon src={iconSrc} className="text-white" imgClassName="w-full h-full object-contain p-0.5" />
          ) : (
            <Icon size={16} className={active ? "text-white" : SLOT_ICON_COLOR[slot] ?? "text-gray-600"} />
          )}
        </div>
        <p className={`text-[10px] font-medium leading-tight line-clamp-2 text-center ${active ? "" : "text-gray-500"}`}>{labelText}</p>
      </button>
    );
  };

  return (
    <div className={`shrink-0 flex flex-col items-center ${className || ""}`}>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {EQUIP_SLOTS.map(renderSlot)}
        <div className="w-px h-16 bg-dark-600 mx-1" />
        {AUX_SLOTS.map(renderSlot)}
      </div>
    </div>
  );
}
