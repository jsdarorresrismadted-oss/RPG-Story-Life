import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { classesApi } from "../services/api";
import { useGameStore } from "../store/gameStore";
import { Character, Skill, ClassPassive } from "../types";
import {
  Shield, Sword, Zap, Star, Clock, Droplets, Heart, Swords,
  ShieldCheck, Sparkles, Lock, ChevronRight, X, MapPin,
  UserPlus, Gauge, Wind, Brain, Crown,
} from "lucide-react";
import toast from "react-hot-toast";
import { EntityIcon } from "../components/EntityIcon";

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

const CORE_STATUS: { key: string; label: string; icon: any; color: string }[] = [
  { key: "strength", label: "Força", icon: Swords, color: "text-orange-400" },
  { key: "intellect", label: "Intelecto", icon: Sparkles, color: "text-purple-400" },
  { key: "endurance", label: "Vigor", icon: Shield, color: "text-yellow-400" },
  { key: "dexterity", label: "Destreza", icon: Wind, color: "text-green-400" },
  { key: "wisdom", label: "Sabedoria", icon: Brain, color: "text-cyan-400" },
  { key: "luck", label: "Sorte", icon: Star, color: "text-pink-400" },
];

const CONVERSION_LABELS: Record<string, string> = {
  attackPower: "Poder de Ataque",
  physicalBoost: "Boost Físico",
  armorPenetration: "Pen. de Armadura",
  spellPower: "Poder de Magia",
  magicalBoost: "Boost Mágico",
  magicPenetration: "Pen. Mágica",
  maxHealth: "HP Máximo",
  physicalResistance: "Res. Física",
  magicalResistance: "Res. Mágica",
  hitChance: "Acerto (Hit)",
  evasion: "Esquiva",
  mana: "Mana",
  manaRegen: "Regen de Mana",
  healingBoost: "Boost de Cura",
  cooldownReduction: "Red. de CD",
  critChance: "Chance de Crítico",
  critMultiplier: "Dano Crítico",
};

const PERCENT_TARGETS = new Set([
  "physicalBoost", "armorPenetration", "magicalBoost", "magicPenetration",
  "physicalResistance", "magicalResistance", "hitChance", "evasion",
  "manaRegen", "healingBoost", "cooldownReduction", "critChance", "critMultiplier",
]);

function formatFinal(points: number, factor: number, isPercent: boolean): string {
  const v = (Number(points) || 0) * (Number(factor) || 0);
  const s = Number.isInteger(v)
    ? v.toLocaleString("pt-BR")
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return isPercent ? `${s}%` : s;
}

interface ClassProgress {
  id: string;
  rank: number;
  experience: number;
  isActive: boolean;
  gameClass: { id: string; name: string; slug: string };
}

export function ClassPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { selectedCharacter } = useGameStore();
  const [data, setData] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  useEffect(() => {
    if (!slug && selectedCharacter?.class?.slug) {
      navigate(`/class/${selectedCharacter.class.slug}`, { replace: true });
      return;
    }
    if (!selectedCharacter) {
      setLoading(false);
      return;
    }
    setLoading(true);
    classesApi.characterClass(selectedCharacter.id)
      .then(({ data }) => setData(data))
      .catch(() => toast.error("Falha ao carregar a classe"))
      .finally(() => setLoading(false));
  }, [slug, selectedCharacter?.id]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!selectedCharacter) {
    return (
      <div className="panel p-8 text-center space-y-4">
        <MapPin size={32} className="mx-auto text-gray-500" />
        <p className="text-gray-400">Você ainda não tem um personagem.</p>
        <Link to="/character/create" className="btn-primary inline-flex items-center gap-2">
          <UserPlus size={16} /> Criar personagem
        </Link>
      </div>
    );
  }

  const character = data;
  if (!character || !character.class) {
    return <div className="text-center py-12 text-gray-400">Classe não encontrada</div>;
  }

  const gameClass: any = character.class;
  const progress: ClassProgress | undefined = (character.classProgress || []).find(
    (p: any) => p.gameClass?.slug === gameClass.slug
  ) ?? (character.classProgress || [])[0];

  const rank = progress?.rank ?? 1;
  const rankXp = progress?.experience ?? 0;
  const xpToNextRank = (data as any).rankXpToNext ?? rank * 150;
  const maxRank = gameClass.rankMax ?? 10;

  const skills: Skill[] = gameClass.skills || [];
  const passives: ClassPassive[] = gameClass.passives || [];
  const autoSkill = skills.find((s) => s.trigger === "auto");
  const actives = skills.filter((s) => s.trigger === "active");
  const ultimate = skills.find((s) => s.trigger === "ultimate");
  const charStats: any = (data as any).stats || {};
  const stats: any = gameClass.stats || {};
  const coreStats: any = stats.coreStats || {};
  const conversion: any = stats.conversion || {};

  const skillSummary = (skill: Skill) => {
    let dmg = 0;
    let heal = 0;
    let effects = 0;
    for (const a of skill.actions || []) {
      if (a.action === "damage") dmg += a.amount ?? 0;
      if (a.action === "heal") heal += a.amount ?? 0;
      if (a.action === "applyEffect") effects++;
    }
    for (const a of skill.onConditionMet || []) {
      if (a.action === "damage") dmg += a.amount ?? 0;
      if (a.action === "heal") heal += a.amount ?? 0;
    }
    return { dmg, heal, effects };
  };

  const SkillCard = ({ skill }: { skill: Skill }) => {
    const locked = skill.rankRequired > rank;
    const isUlt = skill.trigger === "ultimate";
    const isAuto = skill.trigger === "auto";
    const summary = skillSummary(skill);
    return (
      <button
        onClick={() => setSelectedSkill(skill)}
        className={`card-hover text-left p-3 ${isUlt ? "col-span-full bg-gradient-to-r from-yellow-500/5 to-orange-500/5 border-yellow-500/20" : ""} ${
          locked ? "opacity-60" : ""
        } ${selectedSkill?.id === skill.id ? "border-purple-500/50 bg-purple-500/5" : ""}`}
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            isUlt ? "bg-gradient-to-br from-yellow-500 to-orange-500"
            : isAuto ? "bg-gradient-to-br from-gray-600 to-gray-700"
            : "bg-gradient-to-br from-purple-600 to-blue-600"
          }`}>
            {locked ? <Lock size={16} className="text-gray-300" />
              : skill.icon ? (
                <div className="relative w-10 h-10 flex items-center justify-center">
                  <EntityIcon src={skill.icon} size={22} className="text-white" imgClassName="w-8 h-8 object-contain" />
                  {skill.iconSecondary && (
                    <EntityIcon src={skill.iconSecondary} size={22} className="absolute inset-0" imgClassName="absolute inset-0 w-8 h-8 m-auto object-contain translate-x-1 translate-y-1" />
                  )}
                </div>
              )
              : isUlt ? <Zap size={18} className="text-white" />
              : isAuto ? <Swords size={16} className="text-white" />
              : skill.kind === "heal" ? <Heart size={18} className="text-white" />
              : skill.kind === "buff" ? <ShieldCheck size={18} className="text-white" />
              : <Sword size={18} className="text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{skill.name}</p>
              <span className="text-[10px] text-gray-500 bg-dark-700 px-1.5 py-0.5 rounded">{skill.kind}</span>
              {isAuto && <span className="text-[10px] text-gray-400 bg-dark-700 px-1.5 py-0.5 rounded">Automática</span>}
              {isUlt && <span className="text-[10px] text-yellow-300 font-bold">ULTIMATE</span>}
            </div>
            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{skill.description}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
              <span className="text-gray-400 flex items-center gap-1"><Clock size={11} /> {formatMs(skill.cooldown)}</span>
              {skill.manaCost > 0 && <span className="text-blue-400">{skill.manaCost} MP</span>}
              {summary.dmg > 0 && <span className="text-red-400">DMG {summary.dmg}</span>}
              {summary.heal > 0 && <span className="text-green-400">CURA {summary.heal}</span>}
              {summary.effects > 0 && <span className="text-purple-400">+{summary.effects} efeito{summary.effects > 1 ? "s" : ""}</span>}
            </div>
          </div>
          <ChevronRight size={15} className="text-gray-600 shrink-0 mt-1" />
        </div>
        {locked && (
          <p className="text-[10px] text-yellow-500 mt-2 flex items-center gap-1">
            <Lock size={10} /> Libera no Rank {skill.rankRequired}
          </p>
        )}
      </button>
    );
  };

  const PassiveCard = ({ passive }: { passive: ClassPassive }) => {
    const locked = passive.rankRequired > rank;
    return (
      <div className={`card p-3 ${locked ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-green-400 shrink-0" />
          <p className="font-medium text-sm">{passive.name}</p>
        </div>
        <p className="text-xs text-gray-500 mt-1">{passive.description}</p>
        <p className={`text-[10px] mt-1.5 flex items-center gap-1 ${locked ? "text-yellow-500" : "text-green-400"}`}>
          {locked ? <><Lock size={10} /> Libera no Rank {passive.rankRequired}</> : <>Ativa no Rank {passive.rankRequired}</>}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="panel p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-blue-900/10" />
        <div className="relative flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-xs px-2 py-1 bg-dark-700 rounded-md capitalize">{gameClass.role}</span>
              <span className="text-xs px-2 py-1 bg-dark-700 rounded-md capitalize">{gameClass.combatType}</span>
              {gameClass.requiredVip && (
                <span className="text-xs px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-md flex items-center gap-1">
                  <Crown size={11} /> Exclusiva VIP
                </span>
              )}
            </div>
            <h1 className="text-3xl font-display font-bold glow-text mb-2">{gameClass.name}</h1>
            <p className="text-gray-400 text-sm leading-relaxed">{gameClass.description}</p>
            <p className="text-[11px] text-gray-600 mt-1">
              Troque de classe pelo Inventário.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center p-4 bg-dark-800/50 rounded-xl border border-dark-600 min-w-[200px]">
            <span className="text-2xl font-display font-bold text-purple-400">Rank {rank}</span>
            <div className="flex gap-1 mt-3">
              {Array.from({ length: maxRank }, (_, i) => i + 1).map(r => (
                <div key={r} className={`w-2 h-4 rounded-sm ${r <= rank ? "bg-purple-500" : "bg-dark-600"}`} />
              ))}
            </div>
            <div className="w-full mt-3">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>XP da classe</span>
                <span>{rankXp} / {xpToNextRank}</span>
              </div>
              <div className="stat-bar h-1.5">
                <div className="stat-bar-fill bg-gradient-to-r from-purple-500 to-blue-500" style={{ width: `${Math.min(100, (rankXp / xpToNextRank) * 100)}%` }} />
              </div>
            </div>
            {rank < maxRank && (
              <p className="text-[10px] text-gray-500 mt-3 text-center">
                Rank sobe automaticamente ao acumular XP de classe em combates.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats resumo — valores reais do personagem (nível + itens + encantamentos + passivas) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "HP", value: charStats.hp ?? stats.hp, icon: Heart, color: "text-red-400" },
          { label: "Mana", value: charStats.mana ?? stats.mana, icon: Droplets, color: "text-blue-400" },
          { label: "Ataque", value: charStats.attack ?? stats.attack, icon: Swords, color: "text-orange-400" },
          { label: "Defesa", value: charStats.defense ?? stats.defense, icon: ShieldCheck, color: "text-yellow-400" },
          { label: "Magia", value: charStats.magic ?? stats.magic, icon: Sparkles, color: "text-purple-400" },
          { label: "Res. Mágica", value: charStats.magicDefense ?? stats.magicDefense, icon: Shield, color: "text-cyan-400" },
          { label: "Velocidade", value: charStats.attackSpeedMs && charStats.attackSpeedMs > 0 ? `${(charStats.attackSpeedMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s` : "—", icon: Zap, color: "text-green-400" },
          { label: "Regen de Mana", value: charStats.manaRegenPerTick ?? stats.manaRegenPerTick, icon: Droplets, color: "text-blue-300" },
        ].map((stat) => (
          <div key={stat.label} className="panel p-3 flex items-center gap-3">
            <stat.icon size={16} className={stat.color} />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{stat.label}</p>
              <p className="font-mono font-bold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Status: pontos distribuídos + valores finais convertidos */}
      <div className="panel p-4">
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Gauge size={16} className="text-yellow-400" /> Status
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {CORE_STATUS.map(({ key, label, icon: Icon, color }) => {
            const points = coreStats[key] ?? 0;
            const conv = conversion[key] || {};
            return (
              <div key={key} className="bg-dark-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-200">
                    <Icon size={14} className={color} /> {label}
                  </span>
                  <span className="font-mono text-sm font-bold">{points}</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(conv).map(([target, factor]) => (
                    <p key={target} className="text-[11px] text-gray-500 flex items-center justify-between">
                      <span>{CONVERSION_LABELS[target] || target}</span>
                      <span className="text-gray-300 font-mono">
                        {formatFinal(points, factor as number, PERCENT_TARGETS.has(target))}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-600 mt-3 leading-relaxed">
          Pontos distribuídos nos 6 Status Class → valores finais já convertidos pela Combat Engine. Itens somam
          seus valores ao total; encantamentos <span className="text-yellow-500/80">substituem</span> os valores
          do item. A velocidade de ataque vem da arma equipada.
        </p>
      </div>

      {/* Skills */}
      <div className="panel p-4">
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Sword size={16} className="text-purple-400" /> Skills ({skills.length} de 5 · auto + ativas + ultimate)
        </h3>
        {autoSkill && (
          <>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Ataque Automático</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <SkillCard skill={autoSkill} />
            </div>
          </>
        )}
        {actives.length > 0 && (
          <>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 mt-4">Habilidades Ativas</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {actives.map((s) => <SkillCard key={s.id} skill={s} />)}
            </div>
          </>
        )}
        {ultimate && (
          <>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 mt-4">Ultimate</h4>
            <div className="grid grid-cols-1 gap-3">
              <SkillCard skill={ultimate} />
            </div>
          </>
        )}
      </div>

      {/* Passivas */}
      <div className="panel p-4">
        <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-green-400" /> Passivas ({passives.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {passives.map((p) => <PassiveCard key={p.id} passive={p} />)}
        </div>
      </div>

      {/* Detalhe da skill */}
      {selectedSkill && (
        <div className="panel p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                {selectedSkill.icon && (
                  <div className="relative w-8 h-8 shrink-0">
                    <EntityIcon src={selectedSkill.icon} size={22} className="text-white" imgClassName="w-full h-full object-contain" />
                    {selectedSkill.iconSecondary && (
                      <EntityIcon src={selectedSkill.iconSecondary} size={22} className="absolute inset-0" imgClassName="absolute inset-0 w-full h-full object-contain translate-x-1 translate-y-1" />
                    )}
                  </div>
                )}
                <h3 className="text-lg font-display font-bold">{selectedSkill.name}</h3>
                <span className="text-[10px] text-gray-500 bg-dark-700 px-2 py-0.5 rounded uppercase">{selectedSkill.kind}</span>
              </div>
              <p className="text-sm text-gray-400 mt-1">{selectedSkill.description}</p>
            </div>
            <button onClick={() => setSelectedSkill(null)} className="p-1.5 hover:bg-dark-700 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-dark-800/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Tipo</p>
              <p className="font-mono font-bold">{selectedSkill.trigger}</p>
            </div>
            <div className="bg-dark-800/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Cooldown</p>
              <p className="font-mono font-bold">{formatMs(selectedSkill.cooldown)}</p>
            </div>
            {selectedSkill.manaCost > 0 && (
              <div className="bg-dark-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Custo de Mana</p>
                <p className="font-mono font-bold text-blue-400">{selectedSkill.manaCost}</p>
              </div>
            )}
            {selectedSkill.castTime > 0 && (
              <div className="bg-dark-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Tempo de Cast</p>
                <p className="font-mono font-bold text-orange-400">{formatMs(selectedSkill.castTime)}</p>
              </div>
            )}
            {selectedSkill.channelMs > 0 && (
              <div className="bg-dark-800/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Canalização</p>
                <p className="font-mono font-bold text-orange-400">{formatMs(selectedSkill.channelMs)}</p>
              </div>
            )}
            {selectedSkill.scaling && selectedSkill.scaling.length > 0 && (
              <div className="bg-dark-800/50 rounded-lg p-3 col-span-2">
                <p className="text-xs text-gray-500 mb-1">Escala</p>
                <p className="font-mono font-bold text-purple-300">
                  {selectedSkill.scaling.map((s) => `${s.stat} ×${s.factor}`).join(", ")}
                </p>
              </div>
            )}
            {selectedSkill.conditions && selectedSkill.conditions.length > 0 && (
              <div className="bg-dark-800/50 rounded-lg p-3 col-span-2">
                <p className="text-xs text-gray-500 mb-1">Condições</p>
                <p className="font-mono font-bold text-yellow-400">
                  {selectedSkill.conditions.map((c: any) => {
                    if (c.type === "stacksAtLeast") return `Requer ${c.stacks}× ${c.effect}`;
                    if (c.type === "hasEffect") return `Requer efeito ${c.effect}`;
                    if (c.type === "hpPercentBelow") return `Vida < ${c.percent}%`;
                    return c.type;
                  }).join(", ")}
                </p>
              </div>
            )}
            <div className="bg-dark-800/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Rank necessário</p>
              <p className="font-mono font-bold text-yellow-400">{selectedSkill.rankRequired}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
