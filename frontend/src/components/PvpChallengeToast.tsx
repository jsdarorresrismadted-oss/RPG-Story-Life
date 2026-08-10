import { useEffect, useState } from "react";
import { getSocket } from "../services/socket";
import { Swords, X, Check } from "lucide-react";

interface PendingBanner {
  challengeId: string;
  fromName: string;
  expiresAt: number;
}

// Banner global que aparece para o desafiado aceitar/recusar um duelo PvP.
export function PvpChallengeToast() {
  const [banner, setBanner] = useState<PendingBanner | null>(null);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    const onChallenge = (data: { challengeId: string; fromName: string; expiresInMs?: number }) => {
      if (!data?.challengeId) return;
      setBanner({ challengeId: data.challengeId, fromName: data.fromName, expiresAt: Date.now() + (data.expiresInMs ?? 30000) });
    };

    const onResult = () => setBanner(null);

    s.on("pvp:challenge", onChallenge);
    s.on("pvp:challengeResult", onResult);
    s.on("pvp:challengeDeclined", () => setBanner(null));
    return () => {
      s.off("pvp:challenge", onChallenge);
      s.off("pvp:challengeResult", onResult);
      s.off("pvp:challengeDeclined", () => setBanner(null));
    };
  }, []);

  useEffect(() => {
    if (!banner) return;
    const t = setInterval(() => {
      if (Date.now() > banner.expiresAt) setBanner(null);
    }, 500);
    return () => clearInterval(t);
  }, [banner]);

  const respond = (accept: boolean) => {
    const s = getSocket();
    if (!s || !banner) return;
    s.emit("pvp:respondChallenge", { challengeId: banner.challengeId, accept });
    setBanner(null);
  };

  if (!banner) return null;

  return (
    <div className="fixed top-16 right-4 z-50 w-80 rounded-xl border border-purple-500/40 bg-[#15121f]/95 backdrop-blur-md shadow-2xl p-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-300 shrink-0">
          <Swords size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{banner.fromName} te desafiou para um duelo!</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Controle manual — você lança suas skills na hora.</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => respond(true)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/20 border border-green-500/40 text-xs font-bold text-green-300 hover:bg-green-500/30 transition-colors">
          <Check size={14} /> Aceitar
        </button>
        <button onClick={() => respond(false)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-xs font-bold text-red-300 hover:bg-red-500/25 transition-colors">
          <X size={14} /> Recusar
        </button>
      </div>
    </div>
  );
}
