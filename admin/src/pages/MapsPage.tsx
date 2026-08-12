import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { MapPin, Plus, RefreshCw, Shield, Skull, Trash2 } from "lucide-react";
import { adminApi } from "../api";
import EntityFormFields, { EntityField } from "../components/EntityFormFields";

const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none";

const labelClass = "block text-[11px] text-gray-500 mb-1";

const MAP_FIELDS: EntityField[] = [
  { name: "name", label: "Nome", type: "text", required: true },
  { name: "slug", label: "Slug", type: "text", required: true, hint: "Único, minúsculas" },
  { name: "description", label: "Descrição", type: "textarea", required: true },
  { name: "imageUrl", label: "Imagem do mapa", type: "icon" },
  { name: "region", label: "Região", type: "text", required: true },
  { name: "requiredLevel", label: "Nível mínimo", type: "number", defaultValue: 1 },
  { name: "sortOrder", label: "Ordem", type: "number", defaultValue: 0 },
  { name: "type", label: "Tipo de mapa", type: "select", options: ["normal", "raid"], defaultValue: "normal", hint: "raid = boss + tentativas + reset" },
  { name: "raidResetHours", label: "Raid reset (horas)", type: "number", defaultValue: 24 },
  { name: "maxRaidAttempts", label: "Máx tentativas de raid", type: "number", defaultValue: 3 },
  { name: "raidWaves", label: "Ondas do raid", type: "number", defaultValue: 10 },
  { name: "raidDifficulty", label: "Dificuldade do raid", type: "number", defaultValue: 2, hint: "Escala de HP/dano (1-5)" },
  { name: "isPvPZone", label: "Zona PvP", type: "boolean", defaultValue: false },
  { name: "isActive", label: "Ativo", type: "boolean", defaultValue: true },
];

const DEFAULT_MM = {
  monsterId: "",
  spawnRate: 1,
  minLevel: 1,
  maxLevel: 1,
  maxInstances: 10,
  respawnTime: 15000,
  positionX: 0,
  positionY: 0,
};

function mapDefaults(): Record<string, any> {
  const d: Record<string, any> = {};
  for (const f of MAP_FIELDS) d[f.name] = f.type === "boolean" ? false : f.type === "number" ? (f.defaultValue ?? 0) : f.defaultValue ?? "";
  return d;
}

export default function MapsPage() {
  const [maps, setMaps] = useState<any[]>([]);
  const [monsters, setMonsters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"monstros" | "dados">("monstros");
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState<Record<string, any>>(mapDefaults());
  const [saving, setSaving] = useState(false);

  const [mmForm, setMmForm] = useState<Record<string, any>>({ ...DEFAULT_MM });
  const [mmEditing, setMmEditing] = useState<any>(null);
  const [savingMm, setSavingMm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [mapsRes, monstersRes] = await Promise.all([adminApi.maps.list(), adminApi.monsters.list()]);
      setMaps(Array.isArray(mapsRes.data) ? mapsRes.data : []);
      setMonsters(Array.isArray(monstersRes.data) ? monstersRes.data : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(() => maps.find((m) => m.id === selectedId) || null, [maps, selectedId]);

  const filteredMaps = useMemo(() => {
    if (!filter.trim()) return maps;
    const q = filter.toLowerCase();
    return maps.filter((m) => m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q));
  }, [maps, filter]);

  const monsterName = (id: string) => monsters.find((m) => m.id === id)?.name ?? id;

  const selectMap = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    const m = maps.find((mm) => mm.id === id);
    if (m) fillMapForm(m);
  };

  const fillMapForm = (m: any) => {
    const values = mapDefaults();
    for (const f of MAP_FIELDS) {
      if (f.type === "boolean") values[f.name] = !!m[f.name];
      else if (f.type === "number") values[f.name] = Number(m[f.name]) || 0;
      else values[f.name] = m[f.name] ?? "";
    }
    setForm(values);
  };

  const openCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setTab("dados");
    setForm(mapDefaults());
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!String(form.name || "").trim() || !String(form.slug || "").trim()) {
      toast.error("Nome e slug são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const f of MAP_FIELDS) {
        const v = form[f.name];
        if (f.type === "boolean") payload[f.name] = !!v;
        else if (f.type === "number") payload[f.name] = Number(v) || 0;
        else payload[f.name] = v;
      }
      let saved;
      if (creating) {
        saved = (await adminApi.maps.create(payload)).data;
        toast.success(`Mapa "${payload.name}" criado!`);
      } else {
        if (!selectedId) return;
        saved = (await adminApi.maps.update(selectedId, payload)).data;
        toast.success("Mapa atualizado!");
      }
      await load();
      if (saved?.id) {
        setSelectedId(saved.id);
        setCreating(false);
        setTab("monstros");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: any) => {
    if (!window.confirm(`Excluir o mapa "${m.name}"?`)) return;
    try {
      await adminApi.maps.delete(m.id);
      toast.success("Mapa excluído");
      setSelectedId(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const resetMmForm = () => {
    setMmForm({ ...DEFAULT_MM });
    setMmEditing(null);
  };

  const openEditMm = (s: any) => {
    setMmEditing(s);
    setMmForm({
      monsterId: s.monsterId ?? "",
      spawnRate: Number(s.spawnRate) ?? 1,
      minLevel: Number(s.minLevel) ?? 1,
      maxLevel: Number(s.maxLevel) ?? 1,
      maxInstances: Number(s.maxInstances) ?? 10,
      respawnTime: Number(s.respawnTime) ?? 15000,
      positionX: Number(s.positionX) ?? 0,
      positionY: Number(s.positionY) ?? 0,
    });
  };

  const handleSaveMm = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !mmForm.monsterId) {
      toast.error("Escolha um monstro");
      return;
    }
    setSavingMm(true);
    try {
      const payload = {
        mapId: selectedId,
        monsterId: mmForm.monsterId,
        spawnRate: Number(mmForm.spawnRate) || 1,
        minLevel: Number(mmForm.minLevel) || 1,
        maxLevel: Number(mmForm.maxLevel) || 1,
        maxInstances: Number(mmForm.maxInstances) || 10,
        respawnTime: Number(mmForm.respawnTime) || 15000,
        positionX: Number(mmForm.positionX) || 0,
        positionY: Number(mmForm.positionY) || 0,
      };
      if (mmEditing?.id) {
        await adminApi.mapMonsters.update(mmEditing.id, payload);
        toast.success("Monstro atualizado no mapa");
      } else {
        await adminApi.mapMonsters.create(payload);
        toast.success("Monstro adicionado ao mapa");
      }
      resetMmForm();
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSavingMm(false);
    }
  };

  const handleDeleteMm = async (s: any) => {
    if (!window.confirm(`Remover "${monsterName(s.monsterId)}" do mapa "${selected?.name}"?`)) return;
    try {
      await adminApi.mapMonsters.delete(s.id);
      toast.success("Removido");
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao excluir");
    }
  };

  const spawns = useMemo(() => selected?.monsters ?? [], [selected]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mapas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Dados dos mapas e quais monstros aparecem em cada um, com taxa de spawn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Novo mapa
          </button>
          <button onClick={() => load()} className="p-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition-colors" title="Recarregar">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* Cards de mapas */}
        <div className="space-y-2 h-fit">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar mapa..." className={inputClass} />
          <div className="max-h-[72vh] overflow-y-auto space-y-2 pr-1">
            {loading && <p className="text-center text-gray-500 py-8">Carregando...</p>}
            {!loading && filteredMaps.length === 0 && (
              <p className="text-center text-gray-500 py-8">Nenhum mapa — crie um novo</p>
            )}
            {filteredMaps.map((m) => (
              <button
                key={m.id}
                onClick={() => selectMap(m.id)}
                className={`w-full text-left bg-dark-800 border rounded-xl overflow-hidden transition-colors ${
                  selectedId === m.id ? "border-accent-500 bg-accent-600/10" : "border-dark-600 hover:border-gray-500"
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt="" className="w-12 h-12 object-cover rounded-lg bg-dark-700 shrink-0" />
                  ) : (
                    <span className="w-12 h-12 rounded-lg bg-dark-700 flex items-center justify-center text-gray-600 shrink-0">
                      <MapPin size={20} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">{m.name}</span>
                      {m.type === "raid" && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400 shrink-0">RAID</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {m.region || "-"} • Nv {m.requiredLevel} • {m.monsters?.length ?? 0} monstros
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detalhe */}
        <div className="space-y-4">
          {selected || creating ? (
            <>
              <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    {creating ? (
                      <span className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-gray-500"><Plus size={18} /></span>
                    ) : selected?.imageUrl ? (
                      <img src={selected.imageUrl} alt="" className="w-10 h-10 object-cover rounded-lg bg-dark-700" />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-gray-500"><MapPin size={18} /></span>
                    )}
                    <div>
                      <h3 className="font-semibold text-white">
                        {creating ? "Novo mapa" : selected?.name}
                        {!creating && selected?.type === "raid" && (
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-400">RAID</span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {creating ? "Preencha os dados abaixo" : `Região ${selected?.region} • Nv ${selected?.requiredLevel} • ${selected?.monsters?.length ?? 0} monstros`}
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
                        onClick={() => setTab("monstros")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "monstros" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        Monstros
                      </button>
                      <button
                        onClick={() => setTab("dados")}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === "dados" ? "bg-accent-600 text-white" : "text-gray-400 hover:text-white"}`}
                      >
                        {creating ? "Dados do mapa" : "Dados"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {tab === "monstros" && !creating ? (
                <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-white">Monstros do mapa</h3>
                        <p className="text-xs text-gray-500">Quais monstros aparecem e com que frequência</p>
                      </div>
                      <button onClick={resetMmForm} className="text-xs text-accent-400 hover:text-accent-300">
                        + Adicionar monstro
                      </button>
                    </div>
                    <form onSubmit={handleSaveMm} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                      <div className="col-span-2 sm:col-span-4">
                        <label className={labelClass}>Monstro *</label>
                        <select value={mmForm.monsterId ?? ""} onChange={(e) => setMmForm({ ...mmForm, monsterId: e.target.value })} className={inputClass}>
                          <option value="">Selecionar monstro...</option>
                          {monsters.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Spawn Rate</label>
                        <input type="number" step="0.1" value={mmForm.spawnRate ?? 1} onChange={(e) => setMmForm({ ...mmForm, spawnRate: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Nível mín.</label>
                        <input type="number" value={mmForm.minLevel ?? 1} onChange={(e) => setMmForm({ ...mmForm, minLevel: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Nível máx.</label>
                        <input type="number" value={mmForm.maxLevel ?? 1} onChange={(e) => setMmForm({ ...mmForm, maxLevel: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Máx. instâncias</label>
                        <input type="number" value={mmForm.maxInstances ?? 10} onChange={(e) => setMmForm({ ...mmForm, maxInstances: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Respawn (ms)</label>
                        <input type="number" value={mmForm.respawnTime ?? 15000} onChange={(e) => setMmForm({ ...mmForm, respawnTime: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Posição X</label>
                        <input type="number" value={mmForm.positionX ?? 0} onChange={(e) => setMmForm({ ...mmForm, positionX: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Posição Y</label>
                        <input type="number" value={mmForm.positionY ?? 0} onChange={(e) => setMmForm({ ...mmForm, positionY: Number(e.target.value) })} className={inputClass} />
                      </div>
                      <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
                        {mmEditing && (
                          <button type="button" onClick={resetMmForm} className="px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                            Cancel
                          </button>
                        )}
                        <button type="submit" disabled={savingMm} className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                          {savingMm ? "Salvando..." : mmEditing?.id ? "Salvar alterações" : "Adicionar ao mapa"}
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600">
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Monstro</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Spawn</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Níveis</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Máx.</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Respawn (ms)</th>
                          <th className="text-left py-2.5 px-4 text-gray-400 font-medium">Posição</th>
                          <th className="text-right py-2.5 px-4 text-gray-400 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spawns.map((s: any) => (
                          <tr key={s.id} className="border-b border-dark-700 hover:bg-dark-800/50">
                            <td className="py-2.5 px-4 font-medium text-white flex items-center gap-2">
                              <Skull size={14} className="text-gray-500 shrink-0" />
                              {monsterName(s.monsterId)}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs">{s.spawnRate}</td>
                            <td className="py-2.5 px-4 font-mono text-xs">{s.minLevel}–{s.maxLevel}</td>
                            <td className="py-2.5 px-4 font-mono text-xs">{s.maxInstances}</td>
                            <td className="py-2.5 px-4 font-mono text-xs">{s.respawnTime}</td>
                            <td className="py-2.5 px-4 font-mono text-xs">
                              {s.positionX !== null && s.positionX !== undefined ? `${s.positionX}, ${s.positionY}` : "-"}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <button onClick={() => openEditMm(s)} className="text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                              <button onClick={() => handleDeleteMm(s)} className="text-red-400 hover:text-red-300">Delete</button>
                            </td>
                          </tr>
                        ))}
                        {spawns.length === 0 && (
                          <tr><td colSpan={7} className="py-6 text-center text-gray-500">Nenhum monstro neste mapa ainda</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSave} className="bg-dark-800 border border-dark-600 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <Shield size={16} />
                    {creating ? "Dados do novo mapa" : "Dados do mapa"}
                  </div>
                  <EntityFormFields fields={MAP_FIELDS} form={form} onChange={setForm} />
                  <div className="flex justify-end gap-2 pt-2">
                    {creating && (
                      <button type="button" onClick={() => { setCreating(false); setSelectedId(maps[0]?.id ?? null); }} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors">
                        Cancelar
                      </button>
                    )}
                    <button type="submit" disabled={saving} className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {saving ? "Salvando..." : creating ? "Criar mapa" : "Salvar alterações"}
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="bg-dark-800 border border-dark-600 rounded-xl flex flex-col items-center justify-center p-16 space-y-3">
              <MapPin className="text-gray-600" size={28} />
              <p className="text-gray-500">Selecione um mapa para gerenciar dados e monstros</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}