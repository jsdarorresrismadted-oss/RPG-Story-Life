import { Sword, Crown, HardHat, Shield, Wind, Gem, Link2 } from "lucide-react";

interface PreviewItem {
  item: { name: string; icon?: string | null; rarity?: string; type?: string };
}

interface CharacterPreviewProps<T extends PreviewItem> {
  equipped: Record<string, T>;
  onSlotClick?: (slot: string, inv: T | undefined) => void;
  onClassClick?: () => void;
  className?: string;
}

const SLOT_LABELS: Record<string, string> = {
  weapon: "Arma",
  class: "Classe",
  helm: "Elmo",
  armor: "Armadura",
  cape: "Capa",
  ring: "Anel",
  necklace: "Colar",
};

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
}: CharacterPreviewProps<T>) {
  const renderSlot = (slot: string) => {
    const inv = equipped[slot];
    const Icon = SLOT_ICONS[slot] ?? Shield;
    const isClass = slot === "class";
    return (
      <button
        key={slot}
        onClick={() => (isClass ? onClassClick?.() : onSlotClick?.(slot, inv))}
        className={`w-full min-h-[64px] rounded-xl border p-1.5 flex flex-col items-center justify-center gap-1 transition-colors ${
          inv
            ? "border-purple-500/40 bg-gradient-to-br from-purple-600/20 to-blue-600/10"
            : "border-dashed border-dark-600 bg-dark-800/40 hover:border-dark-400"
        }`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          inv ? "bg-gradient-to-br from-purple-600 to-blue-600" : "bg-dark-800/60"
        }`}>
          {inv?.item?.icon ? (
            <img src={inv.item.icon} alt="" className="w-full h-full object-contain p-0.5" style={{ imageRendering: "pixelated" }} />
          ) : (
            <Icon size={16} className={inv ? "text-white" : SLOT_ICON_COLOR[slot] ?? "text-gray-600"} />
          )}
        </div>
        {inv ? (
          <p className="text-[10px] font-medium leading-tight line-clamp-2 text-center">{inv.item.name}</p>
        ) : (
          <p className="text-[10px] font-medium text-gray-500 leading-tight">{SLOT_LABELS[slot] ?? slot}</p>
        )}
      </button>
    );
  };

  return (
    <div className={`shrink-0 flex flex-col items-center ${className || ""}`}>
      <div className="grid grid-cols-3 gap-2 w-[230px]">
        <div />
        {renderSlot("helm")}
        {renderSlot("class")}
        <div />
        {renderSlot("necklace")}
        <div />
        <div />
        {renderSlot("armor")}
        <div />
        {renderSlot("weapon")}
        <div />
        {renderSlot("ring")}
        <div />
        {renderSlot("cape")}
        <div />
      </div>
    </div>
  );
}
