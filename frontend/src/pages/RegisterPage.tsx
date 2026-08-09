import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Sword } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";

export function RegisterPage() {
  const [form, setForm] = useState({ username: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation("register");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error(t("password_mismatch"));
      return;
    }
    setLoading(true);
    try {
      await register({
        username: form.username,
        password: form.password,
        email: form.email || undefined,
      });
      navigate("/");
      toast.success(t("success"));
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
          <h1 className="text-3xl font-display font-bold glow-text">{t("title")}</h1>
          <p className="text-gray-400 mt-2">{t("subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="panel p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t("nickname")}</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input-rpg" placeholder={t("nickname_placeholder")} required />
            <p className="text-[11px] text-gray-500 mt-1">{t("nickname_hint")}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t("email")}</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-rpg" placeholder="email@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t("password")}</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-rpg" placeholder={t("password_placeholder")} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t("confirm_password")}</label>
            <input type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className="input-rpg" placeholder={t("confirm_password_placeholder")} required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? t("creating_account") : t("create_account")}
          </button>
          <p className="text-center text-sm text-gray-400">
            {t("has_account")}{" "}
            <Link to="/login" className="text-purple-400 hover:text-purple-300">{t("sign_in")}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
