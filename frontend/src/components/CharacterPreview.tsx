import { Shield } from "lucide-react";
import { EntityIcon } from "./EntityIcon";

interface PreviewItem {
  item: { name: string; icon?: string | null; rarity?: string };
}

interface CharacterPreviewProps<T extends PreviewItem> {
  name?: string | null;
  equipped: Record<string, T>;
  onClassClick?: () => void;
  className?: string;
  gender?: "male" | "female" | null;
}

export default function CharacterPreview<T extends PreviewItem>({
  name,
  equipped,
  onClassClick,
  className,
  gender,
}: CharacterPreviewProps<T>) {
  const equippedClass = equipped["class"];
  const cls = equippedClass?.item;
  const initial = (name || "").trim().charAt(0).toUpperCase() || "?";
  const isMale = gender !== "female";

  return (
    <div className={`shrink-0 flex flex-col items-center ${className || ""}`}>
      <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center border-2 border-dark-600 shadow-lg shadow-purple-500/20">
        <span className="text-4xl font-bold text-white drop-shadow">{initial}</span>
        <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-dark-800 border border-dark-600 flex items-center justify-center text-[13px] leading-none">
          {isMale ? "♂" : "♀"}
        </span>
      </div>

      {cls && (
        <button
          onClick={onClassClick}
          className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-dark-800/60 border border-purple-500/30 hover:border-purple-500/60 transition-colors text-[11px] text-purple-200"
        >
          <EntityIcon src={cls.icon} size={14} className="text-purple-300" imgClassName="w-4 h-4 object-contain" />
          {cls.name}
        </button>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-500">
        <Shield size={10} className="text-yellow-500" />
        Clique num slot ao lado para ver detalhes
      </div>
    </div>
  );
}
