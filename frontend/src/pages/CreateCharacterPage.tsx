import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { charactersApi } from "../services/api";
import { useAuthStore } from "../store/authStore";
import { useGameStore } from "../store/gameStore";
import type { CharacterIndex, GameClass } from "../types";
import { Shield, Swords, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

export function CreateCharacterPage() {
  const { t } = useTranslation("character");
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const setCharacter = useGameStore((s) => s.setCharacter);

  const [index, setIndex] = useState<CharacterIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [classId, setClassId] = useState<string | null>(null);
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    charactersApi
      .index()
      .then(({ data }) => setIndex(data))
      .catch(() => toast.error(t("failed_load")))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !user?.username?.trim()) return;
    setCreating(true);
    try {
      const { data } = await charactersApi.create({
        name: user.username.trim(),
        classId,
        gender,
      });
      const updatedUser = { ...user, characters: [...(user.characters || []), data] };
      setUser(updatedUser);
      setCharacter(data);
      toast.success(t("created", { name: data.name }));
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("failed_create"));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const classCards = index?.classes || [];

  return (
    <div className="min-h-screen bg-dark-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="text-center">
          <h1 className="text-3xl font-display font-bold glow-text flex items-center justify-center gap-3">
            <Swords size={28} /> {t("title")}
          </h1>
          <p className="text-gray-400 mt-2">
            {t("subtitle", { username: user?.username })}
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-6">
          <section className="panel p-4">
            <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
              <Swords size={18} className="text-purple-400" /> {t("choose_class")}
            </h2>
            {classCards.length === 0 && (
              <p className="text-sm text-gray-500">{t("no_starter_classes")}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {classCards.map((cls: GameClass) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => setClassId(cls.id)}
                  className={`card text-left p-4 transition-all ${
                    classId === cls.id ? "border-purple-500/60 bg-purple-500/10 ring-1 ring-purple-500/40" : "hover:border-purple-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-bold">{cls.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-300 capitalize">{cls.role}</span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{cls.description}</p>
                  <div className="text-xs text-gray-500 mt-2">
                    HP {cls.stats?.hp ?? "-"} • Mana {cls.stats?.mana ?? "-"} • ATK {cls.stats?.attack ?? "-"} • DEF {cls.stats?.defense ?? "-"}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel p-4">
            <h2 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
              <UserPlus size={18} className="text-purple-400" /> {t("choose_gender")}
            </h2>
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {([
                { value: "male", symbol: "♂", label: t("male") },
                { value: "female", symbol: "♀", label: t("female") },
                { value: "other", symbol: "⚧", label: t("other") },
              ] as const).map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGender(g.value)}
                  className={`card text-center p-4 transition-all ${
                    gender === g.value ? "border-purple-500/60 bg-purple-500/10 ring-1 ring-purple-500/40" : "hover:border-purple-500/30"
                  }`}
                >
                  <span
                    className="block w-16 h-16 mx-auto mb-2 leading-[64px] text-5xl font-bold"
                    style={{ lineHeight: "64px" }}
                  >
                    {g.symbol}
                  </span>
                  <span className="font-display font-bold">{g.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel p-4 flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1">
              <p className="text-sm text-gray-400 mb-1 flex items-center gap-2">
                <Shield size={14} className="text-purple-400" /> {t("nick")}
              </p>
              <div className="input-rpg w-full flex items-center gap-2 opacity-70">
                <UserPlus size={16} className="text-gray-500 shrink-0" />
                <span className="text-white">{user?.username || "-"}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{t("nick_hint")}</p>
            </div>
            <button
              type="submit"
              disabled={!classId || creating}
              className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={18} />
              {creating ? t("creating") : t("create")}
            </button>
          </section>

          {!classId && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Shield size={12} /> {t("need_class")}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
