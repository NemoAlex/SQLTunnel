export const SUPPORTED_UI_LOCALES = ["en", "zh-CN", "ja", "ko", "fr", "de"] as const;

export type UiLocale = typeof SUPPORTED_UI_LOCALES[number];
export type UiLanguagePreference = "system" | UiLocale;

export function isUiLanguagePreference(value: unknown): value is UiLanguagePreference {
  return value === "system" || SUPPORTED_UI_LOCALES.includes(value as UiLocale);
}

export function resolveUiLocale(
  preference: UiLanguagePreference,
  systemLanguages: readonly string[]
): UiLocale {
  if (preference !== "system") {
    return preference;
  }

  for (const language of systemLanguages) {
    const normalized = language.trim().replaceAll("_", "-").toLowerCase();
    if (
      normalized === "zh"
      || normalized === "zh-cn"
      || normalized.startsWith("zh-cn-")
      || normalized === "zh-sg"
      || normalized.startsWith("zh-sg-")
      || normalized === "zh-hans"
      || normalized.startsWith("zh-hans-")
    ) return "zh-CN";
    if (normalized === "en" || normalized.startsWith("en-")) return "en";
    if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
    if (normalized === "ko" || normalized.startsWith("ko-")) return "ko";
    if (normalized === "fr" || normalized.startsWith("fr-")) return "fr";
    if (normalized === "de" || normalized.startsWith("de-")) return "de";
  }

  return "en";
}
