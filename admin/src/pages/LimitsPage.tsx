import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { Save, RefreshCw, Scale } from "lucide-react";

interface GameLimits {
  maxLevel: number;
  maxGold: number;
  maxSfCoins: number;
  xpPerLevel: number;
}

export default function LimitsPage() {
  const [limits, setLimits] = useState<GameLimits>({ maxLevel: 150, maxGold: 50000000, maxSfCoins: 1000000, xpPerLevel: 1250 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.settings.limits();
      setLimits({
        maxLevel: Number(data.maxLevel ?? 150),
        maxGold: Number(data.maxGold ?? 50000000),
        maxSfCoins: Number(data.maxSfCoins ?? 1000000),
        xpPerLevel: Number(data.xpPerLevel ?? 1250),
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load limits");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.settings.updateLimits({
        maxLevel: Number(limits.maxLevel),
        maxGold: Number(limits.maxGold),
        maxSfCoins: Number(limits.maxSfCoins),
        xpPerLevel: Number(limits.xpPerLevel),
      });
      toast.success("Limits saved — applied immediately");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save limits");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
            <Scale size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Limites do Jogo</h1>
            <p className="text-sm text-gray-500">Level, gold, SF Coins e curva de XP</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-dark-800 border border-dark-600 rounded-lg text-gray-300 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Reload
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-dark-800 border border-dark-600 rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Level máximo</label>
            <input
              type="number"
              min={1}
              value={limits.maxLevel}
              onChange={(e) => setLimits({ ...limits, maxLevel: Number(e.target.value) })}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Nenhum personagem sobe além disso</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">XP por nível</label>
            <input
              type="number"
              min={1}
              value={limits.xpPerLevel}
              onChange={(e) => setLimits({ ...limits, xpPerLevel: Number(e.target.value) })}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Ex: 1250 = do nível 1 ao 2 precisa de 1.250 XP</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Gold máximo</label>
            <input
              type="number"
              min={0}
              value={limits.maxGold}
              onChange={(e) => setLimits({ ...limits, maxGold: Number(e.target.value) })}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">O ouro não passa deste valor</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">SF Coins máximo</label>
            <input
              type="number"
              min={0}
              value={limits.maxSfCoins}
              onChange={(e) => setLimits({ ...limits, maxSfCoins: Number(e.target.value) })}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">As SF Coins não passam deste valor</p>
          </div>
        </div>

        <div className="bg-dark-900/50 border border-dark-600 rounded-lg p-4 text-sm text-gray-400">
          Os limites valem para os ganhos do jogo (combate, missões etc.) e são aplicados imediatamente, sem redeploy.
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
