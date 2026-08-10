import { useEffect, useState } from "react";
import { contentApi } from "../services/api";
import { BookOpen, Sword, Package } from "lucide-react";
import type { GameClass, Item } from "../types";
import { useTranslation } from "react-i18next";

type CodexTab = "classes" | "items";

export function CodexPage() {
  const { t } = useTranslation("codex");
  const [tab, setTab] = useState<CodexTab>("classes");
  const [classes, setClasses] = useState<GameClass[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    contentApi
      .get()
      .then(({ data }) => {
        setClasses(data.classes ?? []);
        setItems(data.items ?? []);
      })
      .catch(() => {
        setClasses([]);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const tabs: { id: CodexTab; label: string; icon: any }[] = [
    { id: "classes", label: t("classes_tab"), icon: Sword },
    { id: "items", label: t("items_tab"), icon: Package },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-display font-bold flex items-center gap-2">
        <BookOpen size={24} className="text-amber-400" /> {t("title")}
      </h1>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              tab === t.id ? "bg-purple-600/20 text-purple-300 border border-purple-500/30" : "text-gray-400 hover:text-gray-200 bg-dark-800 border border-dark-600"
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "classes" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classes.map((cls) => (
            <div key={cls.id} className="card p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display font-bold text-lg">{cls.name}</h3>
                <div className="flex gap-1">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-300 capitalize">{cls.role}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 capitalize">{cls.combatType}</span>
                </div>
              </div>
              <p className="text-sm text-gray-400">{cls.description}</p>
              <div className="grid grid-cols-4 gap-2 text-center mt-3">
                {[
                  ["HP", cls.stats?.hp], ["Mana", cls.stats?.mana], ["ATK", cls.stats?.attack], ["DEF", cls.stats?.defense],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-dark-800 border border-dark-600 rounded-lg py-2">
                    <p className="text-[11px] text-gray-500">{label}</p>
                    <p className="text-sm font-mono">{value ?? "-"}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {classes.length === 0 && <p className="text-gray-500 text-sm">{t("no_classes")}</p>}
        </div>
      )}

      {tab === "items" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="card p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display font-semibold">{item.name}</h3>
                <span className={`chip-rarity chip-rarity-${item.rarity}`}>{item.rarity}</span>
              </div>
              <p className="text-xs text-gray-400 line-clamp-3">{item.description}</p>
              <div className="text-xs text-gray-500 mt-2">{t("type", { type: item.type })}</div>
            </div>
          ))}
          {items.length === 0 && <p className="text-gray-500 text-sm">{t("no_items")}</p>}
        </div>
      )}
    </div>
  );
}
