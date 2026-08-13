import { useState, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { authApi, redeemApi, adminApi } from "../services/api";
import { Settings, User as UserIcon, Mail, Crown, Star, TrendingUp, Zap, Calendar, Ticket, Download, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";

export function SettingsPage() {
  const { t } = useTranslation("settings");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  const handleExport = async () => {
    setAdminBusy(true);
    try {
      const { data } = await adminApi.exportContent();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `content-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("backup_exported"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("export_failed"));
    } finally {
      setAdminBusy(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAdminBusy(true);
    try {
      const payload = JSON.parse(await file.text());
      const { data } = await adminApi.importContent(payload);
      const total = Object.values(data.counts || {}).reduce((a: number, b: any) => a + b, 0);
      toast.success(t("imported", { total }));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("invalid_file"));
    } finally {
      setAdminBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const { data } = await authApi.updateMe({ displayName: displayName.trim() });
      setUser(data);
      toast.success(t("saved"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setRedeeming(true);
    try {
      const { data } = await redeemApi.redeem(code.trim().toUpperCase());
      if (user) {
        setUser({ ...user, gold: data.gold, sfCoins: data.sfCoins });
      }
      const classesGranted = Array.isArray(data.classes) && data.classes.length > 0
        ? t("classes_unlocked", { classes: data.classes.join(", ") })
        : "";
      const warnings = Array.isArray(data.warnings) && data.warnings.length > 0
        ? t("warnings", { warnings: data.warnings.join(" | ") })
        : "";
      toast.success(t("code_redeemed", { gold: Number(data.gold).toLocaleString(), sfCoins: data.sfCoins, xp: Number(data.experience).toLocaleString(), extra: `${classesGranted}${warnings}` }));
      setCode("");
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("invalid_code"));
    } finally {
      setRedeeming(false);
    }
  };

  const rows = [
    { icon: UserIcon, label: t("username"), value: user?.username },
    { icon: Mail, label: t("email"), value: user?.email || "-" },
    { icon: Crown, label: t("role"), value: user?.role },
    { icon: Star, label: t("level"), value: user?.level || 1 },
    { icon: TrendingUp, label: t("gold"), value: (user?.gold ?? 0).toLocaleString() },
    { icon: Zap, label: t("sf_coins"), value: user?.sfCoins || 0 },
    { icon: Star, label: t("pvp_coins"), value: user?.pvpCoins || 0 },
    { icon: Crown, label: t("gc"), value: user?.gc || 0 },
    { icon: Calendar, label: t("member_since"), value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-" },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <h1 className="text-2xl font-display font-bold flex items-center gap-2">
        <Settings size={24} className="text-purple-400" /> {t("title")}
      </h1>

      <div className="panel p-4 space-y-4">
        <h2 className="font-display font-semibold">{t("account")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2.5">
              <row.icon size={16} className="text-gray-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{row.label}</p>
                <p className="text-sm truncate">{String(row.value ?? "-")}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSave} className="panel p-4 space-y-3">
        <h2 className="font-display font-semibold">{t("display_name")}</h2>
        <div className="flex gap-3">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input-rpg flex-1"
            maxLength={30}
            required
          />
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? t("saving") : t("save")}
          </button>
        </div>
        <p className="text-xs text-gray-500">{t("display_name_hint")}</p>
      </form>

      <div className="panel p-4 space-y-3">
        <h2 className="font-display font-semibold">{t("language")}</h2>
        <LanguageSwitcher />
      </div>

      <form onSubmit={handleRedeem} className="panel p-4 space-y-3">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <Ticket size={16} className="text-yellow-400" /> {t("redeem_code")}
        </h2>
        <div className="flex gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="input-rpg flex-1 font-mono uppercase"
            placeholder={t("redeem_placeholder")}
            maxLength={30}
            required
          />
          <button type="submit" disabled={redeeming} className="btn-primary">
            {redeeming ? t("redeeming") : t("redeem")}
          </button>
        </div>
        <p className="text-xs text-gray-500">{t("redeem_hint")}</p>
      </form>

      {isAdmin && (
        <div className="panel p-4 space-y-3">
          <h2 className="font-display font-semibold flex items-center gap-2">
            <Crown size={16} className="text-yellow-400" /> {t("admin_backup")}
          </h2>
          <p className="text-xs text-gray-500">
            {t("admin_backup_hint")}
          </p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleExport} disabled={adminBusy} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
              <Download size={14} /> {adminBusy ? t("processing", { ns: "common" }) : t("export_backup")}
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={adminBusy} className="btn-secondary flex items-center gap-1.5 disabled:opacity-50">
              <Upload size={14} /> {t("import_backup")}
            </button>
            <input ref={fileRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
          </div>
        </div>
      )}
    </div>
  );
}
