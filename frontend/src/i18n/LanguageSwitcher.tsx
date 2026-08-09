import { useTranslation } from 'react-i18next';
import { languages } from './languages';
import { setLanguage } from './index';
import { Languages as LanguagesIcon } from 'lucide-react';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();

  if (compact) {
    return (
      <select
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value)}
        className="bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500/50"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex gap-2">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            i18n.language === lang.code
              ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
              : 'bg-dark-800 border-dark-600 text-gray-400 hover:text-gray-200'
          }`}
        >
          <span>{lang.flag}</span>
          {lang.label}
        </button>
      ))}
      <span className="flex items-center gap-1 text-gray-500">
        <LanguagesIcon size={14} />
      </span>
    </div>
  );
}
