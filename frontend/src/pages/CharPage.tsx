import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Swords, Shield, Trophy, Skull, Crown, Zap, Medal, Gem,
  Sword, Wand2, HardHat, ScrollText, Users, User,
} from "lucide-react";
import { charactersApi } from "../services/api";
import { EntityIcon } from "../components/EntityIcon";

interface ProfileData {
  username: string;
  displayName: string;
  isOnline: boolean;
  isVip: boolean;
  createdAt: string;
  character: {
    name: string;
    gender: string;
    level: number;
    experience: number;
    xpToNext: number;
    class: { name: string; slug: string; icon?: string | null } | null;
    rank: number;
    pvpKills: number;
    raidClears: number;
    classXp: number;
  };
  guild: { name: string; tag: string; icon?: string | null } | null;
  achievements: { id: string; name: string; description: string; icon?: string | null; category: string; completedAt: string }[];
  achievementsCount: number;
  equipment: { slot: string; name: string; icon?: string | null; rarity: string; type: string }[];
  stats: {
    hp: number; mana: number; attack: number; defense: number; magic: number; magicDefense: number;
    speed: number; attackPower: number; spellPower: number; critChance: number; critDamage: number;
    dodge: number; attackSpeedMs: number; manaRegenPerTick: number;
  };
}

const SLOT_LABELS: Record<string, string> = {
  weapon: "Arma",
  classItem: "Classe",
  helm: "Capacete",
  armor: "Armadura",
  cape: "Capa",
  ring: "Anel",
  necklace: "Colar",
};

const SLOT_ORDER = ["helm", "necklace", "armor", "cape", "ring", "weapon", "classItem"];

const RARITY_TEXT: Record<string, string> = {
  common: "text-gray-300",
  uncommon: "text-green-300",
  rare: "text-blue-300",
  epic: "text-purple-300",
  legendary: "text-orange-300",
  mythic: "text-red-300",
};

export default function CharPage() {
  const { username } = useParams<{ username: string }>();
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(null);
    charactersApi
      .publicProfile(username)
      .then(({ data }) => setData(data))
      .catch((err: any) => setError(err?.response?.data?.error || "Jogador não encontrado."))
      .finally(() => setLoading(false));
  }, [username]);

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
        <ArrowLeft size={16} /> Voltar
      </Link>

      {loading && <p className="text-sm text-gray-500">Carregando perfil...</p>}

      {error && (
        <div className="card p-6 text-center">
          <User size={32} className="mx-auto text-gray-500 mb-2" />
          <p className="text-gray-300">{error}</p>
        </div>
      )}

      {data && (
        <>
          <div className="card p-5 flex items-center gap-5 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-display font-bold">{data.character.name}</h1>
                {data.isVip && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 flex items-center gap-1">
                    <Crown size={10} /> VIP
                  </span>
                )}
                {data.isOnline && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> online
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400">
                @{data.username} {data.displayName !== data.username && <span className="text-gray-600">({data.displayName})</span>}
              </p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-xs">
                  <EntityIcon src={data.character.class?.icon} size={12} className="text-purple-300" imgClassName="w-3.5 h-3.5 object-contain" />
                  {data.character.class?.name ?? "Sem classe"}
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-700 text-gray-300 text-xs">
                  <Swords size={11} /> Rank {data.character.rank}
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 text-xs">
                  <Zap size={11} /> Nv. {data.character.level}
                </span>
                {data.guild && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-xs">
                    <Users size={11} /> [{data.guild.tag}] {data.guild.name}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center shrink-0">
              <div className="px-3 py-2 rounded-lg bg-dark-800 border border-dark-700">
                <p className="text-lg font-bold text-red-300 flex items-center justify-center gap-1"><Skull size={14} />{data.character.pvpKills}</p>
                <p className="text-[10px] text-gray-500 uppercase">PvP Kills</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-dark-800 border border-dark-700">
                <p className="text-lg font-bold text-orange-300 flex items-center justify-center gap-1"><Trophy size={14} />{data.character.raidClears}</p>
                <p className="text-[10px] text-gray-500 uppercase">Raids</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-dark-800 border border-dark-700">
                <p className="text-lg font-bold text-purple-300 flex items-center justify-center gap-1"><Medal size={14} />{data.achievementsCount}</p>
                <p className="text-[10px] text-gray-500 uppercase">Conquistas</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-1.5"><Shield size={14} className="text-cyan-400" /> Atributos</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  ["HP", data.stats.hp.toLocaleString(), "text-green-400"],
                  ["Mana", data.stats.mana.toLocaleString(), "text-blue-400"],
                  ["Ataque", data.stats.attackPower.toLocaleString(), "text-red-300"],
                  ["Poder Mágico", data.stats.spellPower.toLocaleString(), "text-purple-300"],
                  ["Defesa", data.stats.defense.toLocaleString(), "text-yellow-300"],
                  ["Def. Mágica", data.stats.magicDefense.toLocaleString(), "text-indigo-300"],
                  ["Crítico", `${data.stats.critChance.toLocaleString("pt-BR")}%`, "text-orange-300"],
                  ["Dano Crítico", `${data.stats.critDamage.toLocaleString("pt-BR")}%`, "text-orange-300"],
                  ["Esquiva", `${data.stats.dodge.toLocaleString("pt-BR")}%`, "text-cyan-300"],
                  ["Velocidade", `${((data.stats.attackSpeedMs || 2000) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s`, "text-gray-300"],
                  ["Regen Mana", data.stats.manaRegenPerTick.toLocaleString("pt-BR"), "text-blue-300"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="flex items-center justify-between py-0.5 border-b border-dark-800">
                    <span className="text-gray-500 text-xs">{label}</span>
                    <span className={`font-mono ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-1.5"><Sword size={14} className="text-orange-400" /> Equipamento</h2>
              {data.equipment.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum equipamento.</p>
              ) : (
                <div className="space-y-2">
                  {[...data.equipment]
                    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
                    .map((e) => (
                    <div key={e.slot} className="flex items-center gap-2.5 py-1.5 border-b border-dark-800 last:border-0">
                      <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center overflow-hidden shrink-0">
                        {e.icon ? (
                          <EntityIcon src={e.icon} size={16} imgClassName="w-full h-full object-contain p-0.5" />
                        ) : e.type === "weapon" ? (
                          <Sword size={14} className="text-orange-300" />
                        ) : e.type === "helm" ? (
                          <HardHat size={14} className="text-gray-300" />
                        ) : (
                          <Wand2 size={14} className="text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${RARITY_TEXT[e.rarity] || "text-gray-300"}`}>{e.name}</p>
                      </div>
                      <span className="text-[10px] text-gray-500 shrink-0">{SLOT_LABELS[e.slot] || e.slot}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-1.5">
              <Gem size={14} className="text-purple-400" /> Conquistas ({data.achievementsCount})
            </h2>
            {data.achievements.length === 0 ? (
              <p className="text-sm text-gray-500">Ainda não conquistou nada.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.achievements.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-800/60 border border-dark-700">
                    <EntityIcon src={a.icon} size={16} className="text-purple-300" imgClassName="w-4 h-4 object-contain" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-200 truncate">{a.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
