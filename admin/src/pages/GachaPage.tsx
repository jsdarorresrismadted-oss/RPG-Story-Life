import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { Dices, Save } from "lucide-react";

const RARITY_FIELDS = [
  { key: "common", label: "Comum", max: "+5%" },
  { key: "uncommon", label: "Incomum", max: "+10%" },
  { key: "rare", label: "Raro", max: "+15%" },
  { key: "epic", label: "Épico", max: "+20%" },
  { key: "legendary", label: "Lendário", max: "+25%" },
  { key: "mythic", label: "Mítico", max: "+30%" },
] as const;

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-dark-800 border border-dark-600 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none";

export default function GachaPage() {
  const [form, setForm] = useState({
    freeTickets: 3,
    ticketCost: 5000,
    chances: { common: 40, uncommon: 25, rare: 15, epic: 10, legendary: 7, mythic: 3 },
    slotChances: { ring: 50, necklace: 50 },
    active: true,
  });
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: cfg, isLoading: loading } = useQuery({
    queryKey: ["gacha-config"],
    queryFn: async () => {
      const { data } = await adminApi.gachaConfig.get();
      return data;
    },
  });

  useEffect(() => {
    if (cfg) {
      setForm({
        freeTickets: Number(cfg.freeTickets ?? 3),
        ticketCost: Number(cfg.ticketCost ?? 0),
        chances: { common: 40, uncommon: 25, rare: 15, epic: 10, legendary: 7, mythic: 3, ...(cfg.chances ?? {}) },
        slotChances: { ring: 50, necklace: 50, ...(cfg.slotChances ?? {}) },
        active: cfg.active !== false,
      });
    }
  }, [cfg]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.gachaConfig.update({
        freeTickets: Number(form.freeTickets),
        ticketCost: Number(form.ticketCost),
        chances: form.chances,
        slotChances: form.slotChances,
        active: form.active,
      });
      toast.success("Configuração do gacha salva");
      queryClient.invalidateQueries({ queryKey: ["gacha-config"] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const setChance = (key: string, value: number) => {
    setForm((f) => ({ ...f, chances: { ...f.chances, [key]: Math.max(0, Number(value) || 0) } }));
  };

  const setSlotChance = (key: "ring" | "necklace", value: number) => {
    setForm((f) => ({ ...f, slotChances: { ...f.slotChances, [key]: Math.max(0, Number(value) || 0) } }));
  };

  const totalChance = RARITY_FIELDS.reduce((acc, r) => acc + (form.chances[r.key] ?? 0), 0);
  const totalSlotChance = (form.slotChances.ring ?? 0) + (form.slotChances.necklace ?? 0);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <Dices size={20} className="text-purple-400" />
        </div>
        <div>
          <h1 className="font-display font-bold text-lg">Gacha — Anéis e Colares</h1>
          <p className="text-xs text-gray-500">Configuração global do NPC de gacha (Mística)</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <form onSubmit={handleSubmit} className="panel p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Tickets grátis para novos jogadores</label>
              <input type="number" min={0} value={form.freeTickets} onChange={(e) => setForm({ ...form, freeTickets: Number(e.target.value) })} className={inputClass} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Preço do ticket extra (ouro) — 0 = não vendável</label>
              <input type="number" min={0} value={form.ticketCost} onChange={(e) => setForm({ ...form, ticketCost: Number(e.target.value) })} className={inputClass} />
            </div>
          </div>

          <div>
            <p className="text-[11px] text-gray-500 mb-2">Chances de cada raridade (%) — total atual: <span className={totalChance === 100 ? "text-green-400" : "text-yellow-400"}>{totalChance}%</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {RARITY_FIELDS.map((r) => (
                <div key={r.key} className="card p-3">
                  <p className="text-xs font-medium">{r.label} <span className="text-gray-500">(máx {r.max})</span></p>
                  <input type="number" min={0} step={1} value={form.chances[r.key] ?? 0} onChange={(e) => setChance(r.key, Number(e.target.value))} className={`${inputClass} mt-1.5`} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-gray-500 mb-2">Peso de sorteio Anel vs Colar (o total define a probabilidade de cada um) — total atual: <span className={totalSlotChance > 0 ? "text-green-400" : "text-yellow-400"}>{totalSlotChance}</span></p>
            <div className="grid grid-cols-2 gap-3">
              {(["ring", "necklace"] as const).map((slot) => (
                <div key={slot} className="card p-3">
                  <p className="text-xs font-medium capitalize">{slot === "ring" ? "Anel" : "Colar"}</p>
                  <input type="number" min={0} step={1} value={form.slotChances[slot] ?? 0} onChange={(e) => setSlotChance(slot, Number(e.target.value))} className={`${inputClass} mt-1.5`} />
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-purple-500" />
            Gacha ativo
          </label>

          <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
            <Save size={14} /> {saving ? "Salvando..." : "Salvar configuração"}
          </button>
        </form>
      )}
    </div>
  );
}
