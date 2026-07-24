import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { translations, type Lang, type TranslationKey } from "./translations";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Fordítás lekérése - hiányzó kulcsnál a HU érték a fallback. */
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem("language");
    return stored === "en" ? "en" : "hu";
  });

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem("language", l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const dict = translations[lang] as Record<string, string>;
      return dict[key] ?? (translations.hu as Record<string, string>)[key] ?? key;
    },
    [lang],
  );

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage csak LanguageProvider alatt használható");
  return ctx;
}

/**
 * Fordított szöveg renderelése. A régi language.js innerHTML-lel írt be minden
 * fordítást, és több kulcs HTML-t tartalmaz (<br>, <ul>, <span>) - ezért itt is
 * HTML-ként renderelünk. A forrás a saját statikus translations.ts fájlunk,
 * felhasználói adat nem kerül bele.
 */
export function T({ k, as: Tag = "span", className }: { k: TranslationKey; as?: keyof React.JSX.IntrinsicElements; className?: string }) {
  const { t } = useLanguage();
  const Element = Tag as "span";
  return <Element className={className} dangerouslySetInnerHTML={{ __html: t(k) }} />;
}
