import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DICTIONARIES, Lang, LANG_LABELS, MessageKey } from './messages';

const STORAGE_KEY = 'app:language';

/** Remplace les {variables} d'un texte. */
export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>) {
  const text = DICTIONARIES[lang][key] ?? DICTIONARIES.fr[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? '')) : text;
}

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue>({
  lang: 'fr',
  setLang: () => undefined,
  t: (key, vars) => translate('fr', key, vars),
});

/** Langue de l'application, choisie par l'agent dans son profil et gardée sur le téléphone. */
export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => value && value in DICTIONARIES && setLangState(value as Lang))
      .catch(() => undefined);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
export { LANG_LABELS };
export type { Lang, MessageKey };
