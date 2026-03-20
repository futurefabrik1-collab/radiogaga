import { useLanguage } from "@/contexts/LanguageContext";

export default function LanguageToggle() {
  const { lang, toggle } = useLanguage();

  return (
    <button
      onClick={toggle}
      className="fixed top-6 right-6 z-50 text-label tracking-widest opacity-40 hover:opacity-90 transition-opacity duration-500 cursor-pointer select-none"
      aria-label="Toggle language"
    >
      <span className={lang === "de" ? "text-foreground/90" : "text-foreground/40"}>DE</span>
      <span className="text-foreground/20 mx-1">/</span>
      <span className={lang === "en" ? "text-foreground/90" : "text-foreground/40"}>EN</span>
    </button>
  );
}
