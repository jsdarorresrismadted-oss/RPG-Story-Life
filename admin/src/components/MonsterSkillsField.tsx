import { Plus, X } from "lucide-react";
import {
  actionOptions,
  kindOptions,
  targetOptions,
  triggerOptions,
  damageTypeOptions,
} from "../dslFields";

// ===== Editor estruturado das skills de monstro =====
// Substitui o campo "actions (JSON)" por campos diretos (dano, tipo, scaling...),
// mantendo campos extras (slug, sortOrder, isActive etc.) intactos ao salvar.

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-1.5 text-sm text-white focus:border-accent-500 focus:outline-none";

function parseArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function emptySkill(): any {
  return {
    name: "",
    description: "",
    kind: "attack",
    trigger: "auto",
    target: "enemy",
    cooldown: 2000,
    manaCost: 0,
    rankRequired: 1,
    sortOrder: 0,
    actions: [],
  };
}

function emptyAction(): any {
  return { action: "damage", amount: 10, damageType: "physical", scaling: [{ stat: "attack", factor: 1 }] };
}

function scalingParts(action: any): { stat: string; factor: number } {
  const s = parseArray(action?.scaling)[0] || {};
  return { stat: String(s?.stat ?? ""), factor: Number(s?.factor) || 0 };
}

function buildScaling(stat: string, factor: number): any[] {
  const statStr = stat.trim();
  return statStr ? [{ stat: statStr, factor: Number(factor) || 0 }] : [];
}

export default function MonsterSkillsField({ value, onChange }: { value: any; onChange: (v: any[]) => void }) {
  const skills = parseArray(value);

  const setSkill = (idx: number, next: any) => {
    const list = [...skills];
    list[idx] = next;
    onChange(list);
  };

  const setSkillField = (idx: number, name: string, v: any) => {
    setSkill(idx, { ...(skills[idx] || {}), [name]: v });
  };

  const setAction = (skillIdx: number, actionIdx: number, next: any) => {
    const skill = { ...(skills[skillIdx] || {}), actions: [...parseArray(skills[skillIdx]?.actions)] };
    skill.actions[actionIdx] = next;
    setSkill(skillIdx, skill);
  };

  const setActionField = (skillIdx: number, actionIdx: number, name: string, v: any) => {
    const actions = parseArray(skills[skillIdx]?.actions);
    setAction(skillIdx, actionIdx, { ...(actions[actionIdx] || {}), [name]: v });
  };

  const act = (a: any) => (a === undefined ? "" : String(a));

  return (
    <div className="space-y-3">
      {skills.length === 0 && (
        <p className="text-xs text-gray-500">Nenhuma skill. Adicione até 4 skills do monstro abaixo.</p>
      )}
      {skills.map((skill, skillIdx) => (
        <div key={skillIdx} className="border border-dark-600 rounded-lg p-3 space-y-2 relative">
          <button
            type="button"
            onClick={() => onChange(skills.filter((_, i) => i !== skillIdx))}
            className="absolute top-2 right-2 text-gray-500 hover:text-red-400 transition-colors"
            title="Remover skill"
          >
            <X size={16} />
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-6">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Nome *</label>
              <input
                type="text"
                className={inputClass}
                placeholder="ex.: Mordida Feroz"
                value={act(skill.name)}
                onChange={(e) => setSkillField(skillIdx, "name", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Tipo (kind)</label>
              <select
                className={inputClass}
                value={act(skill.kind)}
                onChange={(e) => setSkillField(skillIdx, "kind", e.target.value)}
              >
                <option value="">Selecione...</option>
                {kindOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Gatilho (trigger)</label>
              <select
                className={inputClass}
                value={act(skill.trigger)}
                onChange={(e) => setSkillField(skillIdx, "trigger", e.target.value)}
              >
                <option value="">Selecione...</option>
                {triggerOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Alvo</label>
              <select
                className={inputClass}
                value={act(skill.target)}
                onChange={(e) => setSkillField(skillIdx, "target", e.target.value)}
              >
                <option value="">Selecione...</option>
                {targetOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Cooldown (ms)</label>
              <input
                type="number"
                step="any"
                className={inputClass}
                value={Number(skill.cooldown) || 0}
                onChange={(e) => setSkillField(skillIdx, "cooldown", Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Custo de Mana</label>
              <input
                type="number"
                step="any"
                className={inputClass}
                value={Number(skill.manaCost) || 0}
                onChange={(e) => setSkillField(skillIdx, "manaCost", Number(e.target.value) || 0)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-gray-500 mb-1">Descrição</label>
              <input
                type="text"
                className={inputClass}
                placeholder="O que a skill faz"
                value={act(skill.description)}
                onChange={(e) => setSkillField(skillIdx, "description", e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-accent-400 uppercase tracking-wide">Ações (dano, cura, efeitos)</span>
              <button
                type="button"
                onClick={() => setSkillField(skillIdx, "actions", [...parseArray(skill.actions), emptyAction()])}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-accent-600/20 text-accent-400 border border-accent-600/30 hover:bg-accent-600/30 transition-colors"
              >
                <Plus size={12} /> Ação
              </button>
            </div>
            {parseArray(skill.actions).map((action, actionIdx) => {
              const scaling = scalingParts(action);
              const isEffect = action.action === "applyEffect";
              const isHeal = action.action === "heal";
              return (
                <div key={actionIdx} className="border border-dark-700 rounded-md p-2.5 space-y-2 relative mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const actions = parseArray(skill.actions);
                      setSkillField(skillIdx, "actions", actions.filter((_, i) => i !== actionIdx));
                    }}
                    className="absolute top-1.5 right-1.5 text-gray-500 hover:text-red-400 transition-colors"
                    title="Remover ação"
                  >
                    <X size={14} />
                  </button>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pr-6">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Ação</label>
                      <select
                        className={inputClass}
                        value={act(action.action)}
                        onChange={(e) => setActionField(skillIdx, actionIdx, "action", e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        {actionOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">{isHeal ? "Cura" : "Dano / Quantidade"}</label>
                      <input
                        type="number"
                        step="any"
                        className={inputClass}
                        value={Number(action.amount) || 0}
                        onChange={(e) => setActionField(skillIdx, actionIdx, "amount", Number(e.target.value) || 0)}
                      />
                    </div>
                    {!isEffect && (
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-1">Tipo de dano</label>
                        <select
                          className={inputClass}
                          value={act(action.damageType)}
                          onChange={(e) => setActionField(skillIdx, actionIdx, "damageType", e.target.value)}
                        >
                          <option value="">—</option>
                          {damageTypeOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {isEffect && (
                      <>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Efeito (slug)</label>
                          <input
                            type="text"
                            className={inputClass}
                            placeholder="veneno-corrosivo"
                            value={act(action.effect)}
                            onChange={(e) => setActionField(skillIdx, actionIdx, "effect", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Stacks</label>
                          <input
                            type="number"
                            step="any"
                            className={inputClass}
                            value={Number(action.stacks) || 0}
                            onChange={(e) => setActionField(skillIdx, actionIdx, "stacks", Number(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Alvo do efeito</label>
                          <select
                            className={inputClass}
                            value={act(action.target)}
                            onChange={(e) => setActionField(skillIdx, actionIdx, "target", e.target.value)}
                          >
                            <option value="">—</option>
                            {targetOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Scaling stat</label>
                      <input
                        type="text"
                        className={inputClass}
                        placeholder="attack, magic..."
                        value={scaling.stat}
                        onChange={(e) => {
                          const actions = parseArray(skill.actions);
                          const next = { ...(actions[actionIdx] || {}), scaling: buildScaling(e.target.value, scaling.factor) };
                          setAction(skillIdx, actionIdx, next);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Fator</label>
                      <input
                        type="number"
                        step="any"
                        className={inputClass}
                        value={scaling.factor}
                        onChange={(e) => {
                          const actions = parseArray(skill.actions);
                          const next = { ...(actions[actionIdx] || {}), scaling: buildScaling(scaling.stat, Number(e.target.value)) };
                          setAction(skillIdx, actionIdx, next);
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...skills, emptySkill()])}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-600/20 text-accent-400 border border-accent-600/30 hover:bg-accent-600/30 transition-colors"
      >
        <Plus size={14} /> Adicionar skill
      </button>
    </div>
  );
}