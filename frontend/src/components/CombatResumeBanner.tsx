import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { combatApi } from "../services/api";
import { Swords, X, ChevronRight } from "lucide-react";

// Banner global "Voltar ao Combate": aparece quando o personagem ainda tem
// uma luta ativa sem ter fugido (ex.: saiu da página durante o combate).
export function CombatResumeBanner() {
  const [active, setActive] = useState<{ monsterId: string; monsterName?: string } | null>(null);
  const [hiddenUntil, setHiddenUntil] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { data } = await combatApi.active();
        if (cancelled) return;
        if (data?.active && data?.monsterId) {
          setActive({ monsterId: data.monsterId, monsterName: data.monsterName });
        } else {
          setActive(null);
        }
      } catch {
        if (!cancelled) setActive(null);
      }
    };

    check();
    const t = setInterval(check, 12000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [location.pathname]);

  const inCombat = location.pathname.startsWith("/combat");
  if (!active || inCombat || Date.now() < hiddenUntil) return null;

  const go = () => {
    setHiddenUntil(Date.now());
    navigate(`/combat/${active.monsterId}`);
  };

  return (
    <div className="fixed bottom-6 left-4 z-50 animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-[#1c1016]/95 backdrop-blur-md shadow-2xl p-3 pr-2">
        <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-300 shrink-0">
          <Swords size={16} />
        </div>
        <div className="min-w-0 max-w-[220px]">
          <p className="text-xs font-bold text-white flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            Combate em andamento
          </p>
          <p className="text-[11px] text-gray-400 truncate">
            {active.monsterName ? `Contra ${active.monsterName}` : "Você deixou uma luta aberta."}
          </p>
        </div>
        <button
          onClick={go}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-xs font-bold text-red-200 hover:bg-red-500/30 transition-colors shrink-0"
        >
          Voltar ao Combate <ChevronRight size={12} />
        </button>
        <button
          onClick={() => setHiddenUntil(Date.now() + 60000)}
          className="p-1.5 rounded-lg hover:bg-dark-700 transition-colors text-gray-500 hover:text-gray-300 shrink-0"
          title="Esconder por 1 minuto"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}