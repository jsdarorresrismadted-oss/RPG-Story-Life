import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, MapPin, Plus, RefreshCw, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { adminApi } from "../api";
import EntityFormFields, { EntityField } from "../components/EntityFormFields";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

const MONSTER_FIELDS: EntityField[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "description", label: "Descrição", type: "textarea", required: true },
  { name: "imageUrl", label: "Ícone do monstro", type: "icon" },
  { name: "element", label: "Elemento", type: "text", placeholder: "fire, ice, dark, arcane..." },
  { name: "attackType", label: "Tipo de ataque", type: "select", options: ["melee", "ranged", "magic"] },
  { name: "personality", label: "Personalidade", type: "select", options: ["agressive", "passive", "defensive"] },
  { name: "level", label: "Nível", type: "number", defaultValue: 1 },
  { name: "hp", label: "HP", type: "number", defaultValue: 50 },
  { name: "mana", label: "Mana", type: "number", defaultValue: 20 },
  { name: "attack", label: "Ataque", type: "number", defaultValue: 10 },
  { name: "defense", label: "Defesa", type: "number", defaultValue: 5 },
  { name: "magic", label: "Magia", type: "number", defaultValue: 5 },
  { name: "magicDefense", label: "Defesa mágica", type: "number", defaultValue: 5 },
  { name: "speed", label: "Velocidade", type: "number", defaultValue: 10 },
  { name: "attackSpeed", label: "Velocidade de ataque (ms)", type: "number", defaultValue: 2000 },
  { name: "xpReward", label: "XP (XP Reward)", type: "number", defaultValue: 10 },
  { name: "classXpReward", label: "CXP (XP de Classe)", type: "number", defaultValue: 0, hint: "0 = igual ao XP normal" },
  { name: "goldReward", label: "Gold", type: "number", defaultValue: 5 },
  { name: "isElite", label: "Elite", type: "boolean", defaultValue: false },
  { name: "isBoss", label: "Boss", type: "boolean", defaultValue: false },
  { name: "isActive", label: "Ativo (aparece no jogo)", type: "boolean", defaultValue: true },
  { name: "skills", label: "Skills do monstro (dano, cura, efeitos)", type: "monster-skills", hint: "Máx 4 skills — use amount + scaling (stat/fator) para controlar o dano" },
];

const DEFAULT_DROP = {
  itemId: "",
  dropChance: 10,
  minQuantity: 1,
  maxQuantity: 1,
  minLevel: 1,
  maxLevel: 99,
  isGuaranteed: false,
};

const DEFAULT_AI_PROMPT = "lobo ancião de gelo da floresta, nível 12, que usa mordida congelante";

function monsterDefaults(): Record<string, any> {
  const d: Record<string, any> = {};
  for (const f of MONSTER_FIELDS) d[f.name] = f.type === "boolean" ? false : f.type === "number" ? (f.defaultValue ?? 0) : f.defaultValue ?? "";
  d.skills = [];
  return d;
}

export default function MonstersPage() {
  const [monsters, setMonsters] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [maps, setMaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"geral" | "drops">("geral");
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState<Record<string, any>>(monsterDefaults());
  const [saving, setSaving] = useState(false);

  const [drops, setDrops] = useState<any[]>([]);
  const [loadingDrops, setLoadingDrops] = useState(false);
  const [dropForm, setDropForm] = useState<Record<string, any>>({ ...DEFAULT_DROP });
  const [dropEditing, setDropEditing] = useState<any>(null);
  const [savingDrop, setSavingDrop] = useState(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_PROMPT);
  const [aiBusy, setAiBusy] = useState(false);

  const load = async (keepSelection = true) => {
    setLoading(true);
    try {
      const [mRes, iRes, mapRes] = await Promise.all([
        adminApi.monsters.list(),
        adminApi.items.list(),
        adminApi.maps.list(),
      ]);
      setMonsters(Array.isArray(mRes.data) ? mRes.data : []);
      setItems(Array.isArray(iRes.data) ? iRes.data : []);
      setMaps(Array.isArray(mapRes.data) ? mapRes.data : []);
      if (!keepSelection) setSelectedId(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(() => monsters.find((m) => m.id === selectedId) || null, [monsters, selectedId]);

  const filteredMonsters = useMemo(() => {
    if (!filter.trim()) return monsters;
    const q = filter.toLowerCase();
    return monsters.filter((m) => m.name.toLowerCase().includes(q));
  }, [monsters, filter]);

  const mapsOf = (monsterId: string) => maps.filter((m) => Array.isArray(m.monsters) && m.monsters.some((s: any) => s.monsterId === monsterId));

  const fillForm = (m: any) => {
    const values = monsterDefaults();
    for (const f of MONSTER_FIELDS) {
      if (f.type === "boolean") values[f.name] = !!m[f.name];
      else if (f.type === "number") values[f.name] = Number(m[f.name]) || 0;
      else values[f.name] = m[f.name] ?? "";
    }
    if (typeof m.skills === "string" && m.skills.trim()) {
      try {
        values.skills = JSON.parse(m.skills);
      } catch {
        values.skills = [];
      }
    } else if (Array.isArray(m.skills)) {
      values.skills = m.skills;
    }
    setForm(values);
  };

  const loadDrops = async (monsterId: string) => {
    setLoadingDrops(true);
    try {
      const res = await adminApi.monsters.drops.list(monsterId);
      setDrops(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load drops");
    } finally {
      setLoadingDrops(false);
    }
  };

  const selectMonster = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    const m = monsters.find((mm) => mm.id === id);
    if (m) fillForm(m);
    if (tab === "drops") loadDrops(id);
  };

  const openCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setTab("geral");
    setForm(monsterDefaults());
  };

  const handleTab = (t: "geral" | "drops") => {
    setTab(t);
    if (t === "drops" && selectedId) loadDrops(selectedId);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!String(form.name || "").trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const f of MONSTER_FIELDS) {
        const v = form[f.name];
        if (f.name === "skills") payload.skills = Array.isArray(v) && v.length > 0 ? JSON.stringify(v) : null;
        else if (f.type === "boolean") payload[f.name] = !!v;
        else if (f.type === "number") payload[f.name] = Number(v) || 0;
        else payload[f.name] = v;
      }
      let saved;
      if (creating) {
        saved = (await adminApi.monsters.create(payload)).data;
        toast.success(`Monstro "${payload.name}" criado!`);
      } else {
        if (!selectedId) return;
        saved = (await adminApi.monsters.update(selectedId, payload)).data;
        toast.success("Monstro atualizado!");
      }
      await load(false);
      if (saved?.id) selectMonster(saved.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: any) => {
    if (!window.confirm(`Excluir o monstro "${m.name}"?`)) return;
    try {
      await adminApi.monsters.delete(m.id);
      toast.success("Monstro excluído");
      await load(false);
      setDrops([]);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const resetDropForm = () => {
    setDropForm({ ...DEFAULT_DROP });
    setDropEditing(null);
  };

  const openEditDrop = (d: any) => {
    setDropEditing(d);
    setDropForm({
      itemId: d.itemId,
      dropChance: Number(d.dropChance) ?? 10,
      minQuantity: Number(d.minQuantity) || 1,
      maxQuantity: Number(d.maxQuantity) || 1,
      minLevel: Number(d.minLevel) || 1,
      maxLevel: Number(d.maxLevel) || 99,
      isGuaranteed: !!d.isGuaranteed,
    });
  };

  const handleSaveDrop = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !dropForm.itemId) {
      toast.error("Escolha um item");
      return;
    }
    setSavingDrop(true);
    try {
      const payload = {
        itemId: dropForm.itemId,
        dropChance: Number(dropForm.dropChance) || 1,
        minQuantity: Number(dropForm.minQuantity) || 1,
        maxQuantity: Number(dropForm.maxQuantity) || 1,
        minLevel: Number(dropForm.minLevel) || 1,
        maxLevel: Number(dropForm.maxLevel) || 99,
        isGuaranteed: !!dropForm.isGuaranteed,
      };
      if (dropEditing?.id) {
        await adminApi.monsters.drops.update(dropEditing.id, payload);
        toast.success("Drop atualizado");
      } else {
        await adminApi.monsters.drops.create(selectedId, payload);
        toast.success("Drop adicionado");
      }
      resetDropForm();
      await loadDrops(selectedId);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSavingDrop(false);
    }
  };

  const handleDeleteDrop = async (d: any) => {
    if (!window.confirm(`Remover o drop "${d.item?.name ?? d.itemId}"?`)) return;
    try {
      await adminApi.monsters.drops.delete(d.id);
      toast.success("Removido");
      if (selectedId) await loadDrops(selectedId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Descreva o que a IA deve criar");
      return;
    }
    setAiBusy(true);
    try {
      const res = await adminApi.ai.generateMonster(aiPrompt.trim());
      const saved = res.data?.data;
      toast.success(`Monstro "${saved?.name ?? "?"}" gerado e salvo no banco!`);
      setAiOpen(false);
      await load(false);
      if (saved?.id) selectMonster(saved.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Falha ao gerar");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monstros / Bosses</h1>
          <p className="text-sm text-gray-500 mt-1">
            Stats, skills, drops e spawns — tudo em um só lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAiOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Wand2 size={16} /> Gerar com IA
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Novo monstro
          </button>
          <button onClick={() => load()} className="p-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors" title="Recarregar">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Lista */}
        <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden h-fit">
          <div className="p-4 border-b border-dark-600">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar monstro..." className={inputClass} />
          </div>
          <div className="max-h-[72vh] overflow-y-auto">
            {loading && <p className="text-center text-gray-500 py-8">Carregando...</p>}
            {!loading && filteredMonsters.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhum monstro — crie um ou use o gerador de IA</p>
            )}
            {filteredMonsters.map((m) => {
              const spawnCount = mapsOf(m.id).length;
              return (
                <button
                  key={m.id}
                  onClick={() => selectMonster(m.id)}
                  className={`w-full text-left px-4 py-3 border-b border-dark-700 transition-colors flex items-center gap-3 ${
                    selectedId === m.id ? "bg-accent-600/20 border-l-2 border-l-accent-500" : "hover:bg-dark-700/50"
                  }`}
                >
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt="" className="w-9 h-9 object-contain rounded bg-dark-700 p-0.5 shrink-0" style={{ imageRendering: "pixelated" }} />
                  ) : (
                    <span className="w-9 h-9 rounded bg-dark-700 flex items-center justify-center text-gray-600 shrink-0">?</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-white block truncate">{m.name}</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                      Nv {m.level}
                      {m.isBoss && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">BOSS</span>}
                      {m.isElite && !m.isBoss && <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-yellow-500/20 text-yellow-400">Elite</span>}
                      {spawnCount > 0 && (
                        <span className="flex items-center gap-0.5 text-gray-500">
                          <MapPin size={11} /> {spawnCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalhe */}
        <div className="space-y-4">
          {(selected || creating) ? (
            <>
              <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    {creating ? (
                      <span className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-gray-500">?</span>
                    ) : selected?.imageUrl ? (
                      <img src={selected.imageUrl} alt="" className="w-10 h-10 object-contain rounded bg-dark-700 p-0.5" style={{ imageRendering: "pixelated" }} />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-gray-500">?</span>
                    )}
                    <div>
                      <h3 className="font-semibold text-white">
                        {creating ? "Novo monstro" : selected?.name}
                        {!creating && selected?.isBoss && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">BOSS</span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {creating ? "Preencha os dados abaixo" : `Nv ${selected?.level} • HP ${selected?.hp} • Atk ${selected?.attack}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!creating && (
                      <button
                        onClick={() => handleDelete(selected!)}
                        className="flex items-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg text-sm transition-colors"
                      >
                        <Trash2 size={15} /> Excluir
                      </button>
                    )}
                    <div className="flex bg-dark-900 border border-dark-600 rounded-lg p-0.5">
                      <button
                        onClick={() => handleTab("geral")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "geral" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        Geral
                      </button>
                      <button
                        onClick={() => handleTab("drops")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "drops" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        Drops {!creating && drops.length > 0 ? `(${drops.length})` : ""}
                      </button>
                    </div>
                  </div>
                </div>

                {!creating && selected && (
                  <div className="px-4 py-2 border-b border-dark-600 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                    Elemento: {selected.element || "neutral"} • Elite: {selected.isElite ? "sim" : "não"} • CXP: {Number(selected.classXpReward) || "="} • XP: {Number(selected.xpReward)}
                    {mapsOf(selected.id).length > 0 && (
                      <span className="text-gray-500 flex items-center gap-1">
                        • Spawna em: {mapsOf(selected.id).map((m) => m.name).join(", ")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {tab === "geral" ? (
                <form onSubmit={handleSave} className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4">
                  <EntityFormFields fields={MONSTER_FIELDS} form={form} onChange={setForm} />
                  <div className="flex justify-end gap-2 pt-2">
                    {creating && (
                      <button type="button" onClick={() => { setCreating(false); setSelectedId(monsters[0]?.id ?? null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                        Cancelar
                      </button>
                    )}
                    <button type="submit" disabled={saving} className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {saving ? "Salvando..." : creating ? "Criar monstro" : "Salvar alterações"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Drops de itens</h3>
                        <p className="text-xs text-gray-500">Itens que {selected?.name} dropa e a taxa (%)</p>
                      </div>
                      <button onClick={resetDropForm} className="text-xs text-accent-400 hover:text-accent-300">
                        + Adicionar drop
                      </button>
                    </div>
                    <form onSubmit={handleSaveDrop} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                      <div className="col-span-2 sm:col-span-4">
                        <label className={labelClass}>Item *</label>
                        <select value={dropForm.itemId ?? ""} onChange={(e) => setDropForm({ ...dropForm, itemId: e.target.value })} className={inputClass}>
                          <option value="">Selecionar item...</option>
                          {items.filter((i) => i.isActive !== false).map((i) => (
                            <option key={i.id} value={i.id}>{i.name} ({i.rarity ?? "?"})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Taxa de drop (%)</label>
                        <input type="number" step="0.1" min={0} max={100} value={dropForm.dropChance ?? 10} onChange={(e) => setDropForm({ ...dropForm, dropChance: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Qtd. mín.</label>
                        <input type="number" min={1} value={dropForm.minQuantity ?? 1} onChange={(e) => setDropForm({ ...dropForm, minQuantity: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Qtd. máx.</label>
                        <input type="number" min={1} value={dropForm.maxQuantity ?? 1} onChange={(e) => setDropForm({ ...dropForm, maxQuantity: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Nível do jogador (mín–máx)</label>
                        <div className="flex items-center gap-1">
                          <input type="number" min={1} value={dropForm.minLevel ?? 1} onChange={(e) => setDropForm({ ...dropForm, minLevel: Number(e.target.value) })} className={inputClass} />
                          <span className="text-gray-500">–</span>
                          <input type="number" min={1} value={dropForm.maxLevel ?? 99} onChange={(e) => setDropForm({ ...dropForm, maxLevel: Number(e.target.value) })} className={inputClass} />
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-3 flex items-center gap-2 h-9">
                        <input id="isGuaranteed" type="checkbox" checked={!!dropForm.isGuaranteed} onChange={(e) => setDropForm({ ...dropForm, isGuaranteed: e.target.checked })} className="w-4 h-4 accent-accent-500" />
                        <label htmlFor="isGuaranteed" className="text-sm text-gray-300">Drop garantido (100%)</label>
                      </div>
                      <div className="flex justify-end gap-2">
                        {dropEditing && (
                          <button type="button" onClick={resetDropForm} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                            Cancel
                          </button>
                        )}
                        <button type="submit" disabled={savingDrop} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                          {savingDrop ? "Salvando..." : dropEditing?.id ? "Salvar alterações" : "Adicionar drop"}
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Item</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Chance</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Qtd</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Níveis</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Garantido</th>
                          <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingDrops && (
                          <tr><td colSpan={6} className="py-6 text-center text-gray-500">Carregando...</td></tr>
                        )}
                        {!loadingDrops && drops.map((d) => (
                          <tr key={d.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                {d.item?.icon && <img src={d.item.icon} alt="" className="w-7 h-7 object-contain rounded bg-dark-700 p-0.5" style={{ imageRendering: "pixelated" }} />}
                                <span className="font-medium text-white">{d.item?.name ?? d.itemId}</span>
                                {d.item?.rarity && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dark-700 text-gray-400 capitalize">{d.item.rarity}</span>}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs">{d.dropChance}%</td>
                            <td className="py-2.5 px-4 font-mono text-xs">{d.minQuantity}–{d.maxQuantity}</td>
                            <td className="py-2.5 px-4 font-mono text-xs">{d.minLevel}–{d.maxLevel}</td>
                            <td className="py-2.5 px-4">
                              {d.isGuaranteed ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">Sim</span> : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <button onClick={() => openEditDrop(d)} className="text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                              <button onClick={() => handleDeleteDrop(d)} className="text-red-400 hover:text-red-300">Delete</button>
                            </td>
                          </tr>
                        ))}
                        {!loadingDrops && drops.length === 0 && (
                          <tr><td colSpan={6} className="py-6 text-center text-gray-500">Nenhum drop configurado</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-dark-800 border border-dark-600 rounded-xl flex flex-col items-center justify-center p-16 space-y-3">
              <Sparkles className="text-gray-600" size={28} />
              <p className="text-gray-500">Selecione um monstro, crie um novo ou use o gerador de IA</p>
              <button
                onClick={() => setAiOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Wand2 size={16} /> Gerar monstro com IA
              </button>
            </div>
          )}
        </div>
      </div>

      {aiOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !aiBusy && setAiOpen(false)}>
          <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Wand2 size={18} className="text-fuchsia-400" /> Gerar monstro com IA
              </h2>
              <button onClick={() => setAiOpen(false)} className="text-gray-500 hover:text-gray-300 text-xl leading-none" disabled={aiBusy}>
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Gemini (ou Groq como fallback) cria stats, skills e drops — e salva no banco. Você revisa e ajusta depois neste painel.
            </p>
            <label className={labelClass}>Prompt para a IA</label>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} className={inputClass} placeholder="Descreva o monstro..." />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setAiPrompt(DEFAULT_AI_PROMPT)} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                Exemplo
              </button>
              <button
                onClick={handleAiGenerate}
                disabled={aiBusy}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {aiBusy ? "Gerando (pode levar ~1min)..." : "Gerar e salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}