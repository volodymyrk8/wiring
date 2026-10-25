import { useState } from "preact/hooks";
import { getLanguage, selectLanguage, type Language } from "@/lib/i18n";
import { Select } from "./Select";
import styles from "./AppHeader.module.css";

export function LanguageSwitch() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div class={styles.language}>
    <Select<Language> ariaLabel="Язык / Language" title="Язык / Language" value={getLanguage()}
      options={[{ value: "ru", label: "RU", disabled: busy }, { value: "en", label: "EN", disabled: busy }]}
      onChange={async language => {
        if (busy || language === getLanguage()) return;
        setBusy(true); setError("");
        try { await selectLanguage(language); } catch (error) { setError(error instanceof Error ? error.message : "Could not change language"); setBusy(false); }
      }} variant="pill" showChevron={false} />
    {error && <span role="alert">{error}</span>}
  </div>;
}
