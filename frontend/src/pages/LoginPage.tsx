import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Sword } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation("login");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
      toast.success(t("welcome_back"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher compact />
        </div>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 mb-4">
            <Sword size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold glow-text">RPG Story Life</h1>
          <p className="text-gray-400 mt-2">{t("subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t("username")}</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-rpg"
              placeholder={t("username_placeholder")}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t("password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-rpg"
              placeholder={t("password_placeholder")}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? t("signing_in") : t("sign_in")}
          </button>

          <p className="text-center text-sm text-gray-400">
            {t("no_account")}{" "}
            <Link to="/register" className="text-purple-400 hover:text-purple-300">{t("register")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
