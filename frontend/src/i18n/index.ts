import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const langFiles = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const path in langFiles) {
  const parts = path.split('/');
  const lang = parts[parts.length - 2];
  const name = parts[parts.length - 1].replace('.json', '');
  resources[lang] = resources[lang] || {};
  resources[lang][name] = langFiles[path];
}

export const supportedLanguages = ['pt', 'en', 'es'];

function getInitialLanguage(): string {
  const saved = localStorage.getItem('rpg_lang');
  return saved && supportedLanguages.includes(saved) ? saved : 'pt';
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'pt',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(lang: string) {
  if (!supportedLanguages.includes(lang)) return;
  localStorage.setItem('rpg_lang', lang);
  i18n.changeLanguage(lang);
}

export default i18n;
