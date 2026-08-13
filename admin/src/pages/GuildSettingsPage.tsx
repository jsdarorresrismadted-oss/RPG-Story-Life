import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "../api";
import { Save, RefreshCw, Swords } from "lucide-react";

interface GuildSettings {
  requiredLevel: number;
  requiredGold: number;
  requiredSfCoins: number;
}

export default function GuildSettingsPage() {
  const [settings, setSettings] = useState<GuildSettings>({ requiredLevel: 2, requiredGold: 200, requiredSfCoins: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.settings.guild();
      setSettings({
        requiredLevel: Number(data.requiredLevel ?? 2),
        requiredGold: Number(data.requiredGold ?? 200),
        requiredSfCoins: Number(data.requiredSfCoins ?? 0),
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to load settings");
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
      await adminApi.settings.updateGuild({
        requiredLevel: Number(settings.requiredLevel),
        requiredGold: Number(settings.requiredGold),
        requiredSfCoins: Number(settings.requiredSfCoins),
      });
      toast.success("Guild requirements saved");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Swords size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Guild Settings</h1>
            <p className="text-sm text-gray-500">Requirements to create a guild</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Required Level</label>
            <input
              type="number"
              min={0}
              value={settings.requiredLevel}
              onChange={(e) => setSettings({ ...settings, requiredLevel: Number(e.target.value) })}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Minimum player level to create a guild</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Required Gold</label>
            <input
              type="number"
              min={0}
              value={settings.requiredGold}
              onChange={(e) => setSettings({ ...settings, requiredGold: Number(e.target.value) })}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Gold required to create a guild</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Required SF Coins</label>
            <input
              type="number"
              min={0}
              value={settings.requiredSfCoins}
              onChange={(e) => setSettings({ ...settings, requiredSfCoins: Number(e.target.value) })}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1">SF Coins required to create a guild</p>
          </div>
        </div>

        <div className="bg-dark-900/50 border border-dark-600 rounded-lg p-4 text-sm text-gray-400">
          Players below these requirements will see an error when trying to create a guild.
          Changes apply immediately to all players.
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
