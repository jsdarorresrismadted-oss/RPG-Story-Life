import { useState } from "react";
import { MessageCircle, LifeBuoy, Mail, ShieldCheck, ScrollText } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

export function SupportPage() {
  const { t } = useTranslation("support");
  const [form, setForm] = useState({ subject: "", message: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    toast.success(t("message_sent"));
    setForm({ subject: "", message: "" });
  };

  const faqs = [
    { q: t("faq_create_character_q"), a: t("faq_create_character_a") },
    { q: t("faq_guild_q"), a: t("faq_guild_a") },
    { q: t("faq_tickets_q"), a: t("faq_tickets_a") },
    { q: t("faq_bug_q"), a: t("faq_bug_a") },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <h1 className="text-2xl font-display font-bold flex items-center gap-2">
        <LifeBuoy size={24} className="text-blue-400" /> {t("title")}
      </h1>

      <div className="panel p-4 space-y-4">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <ScrollText size={18} className="text-cyan-400" /> {t("faq")}
        </h2>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="bg-dark-800 border border-dark-600 rounded-lg p-3 text-sm">
              <summary className="cursor-pointer font-medium text-gray-200 hover:text-purple-300">{f.q}</summary>
              <p className="text-gray-400 mt-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="panel p-4 space-y-3">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <Mail size={18} className="text-green-400" /> {t("contact")}
        </h2>
        <input
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          className="input-rpg w-full"
          placeholder={t("subject")}
          maxLength={100}
          required
        />
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className="input-rpg w-full"
          placeholder={t("message_placeholder")}
          rows={4}
          required
        />
        <button type="submit" className="btn-primary flex items-center gap-2">
          <MessageCircle size={16} /> {t("send_message")}
        </button>
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <ShieldCheck size={12} /> {t("info_hint")}
        </p>
      </form>
    </div>
  );
}
